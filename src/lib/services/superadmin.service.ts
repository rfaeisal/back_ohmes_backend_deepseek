// =============================================================================
// SUPERADMIN Service — Privileged Actions
// =============================================================================

import { eq, and, isNull, sql, desc } from "drizzle-orm";
import db from "@/db";
import {
  user,
  userSession,
  role,
  userAssignment,
  auditLog,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { revokeAllUserSessions, getUserSessions } from "@/lib/auth/session";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export interface SecurityLogEntry {
  type: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  reason?: string;
  actorUserId?: string;
  targetUserId?: string;
}

// =============================================================================
// Impersonate — login sebagai user lain
// =============================================================================

export async function impersonateUser(
  superadminId: string,
  targetUserId: string,
  reason: string
) {
  // Validasi target user exists
  const [targetUser] = await db
    .select({ id: user.id, username: user.username, fullName: user.fullName })
    .from(user)
    .where(eq(user.id, targetUserId))
    .limit(1);

  if (!targetUser) throw new ServiceError("USER_NOT_FOUND", "User target tidak ditemukan.");

  // Ambil role SUPERADMIN asli
  const [superadminRole] = await db
    .select({ id: role.id, code: role.code })
    .from(role)
    .where(eq(role.code, "SUPERADMIN"))
    .limit(1);

  if (!superadminRole) throw new ServiceError("ROLE_NOT_FOUND", "Role SUPERADMIN tidak ditemukan.");

  // Verifikasi actor adalah SUPERADMIN
  const [actorAssignment] = await db
    .select()
    .from(userAssignment)
    .where(
      and(
        eq(userAssignment.userId, superadminId),
        eq(userAssignment.roleId, superadminRole.id),
        isNull(userAssignment.revokedAt)
      )
    )
    .limit(1);

  if (!actorAssignment) {
    throw new ServiceError("NOT_SUPERADMIN", "Hanya SUPERADMIN yang bisa impersonate.");
  }

  // Audit log privileged
  await db.insert(auditLog).values({
    actorUserId: superadminId,
    action: "super.impersonate",
    entityTable: "user",
    entityId: targetUserId,
    after: { reason, targetUsername: targetUser.username },
    isPrivileged: true,
  });

  return {
    impersonatorId: superadminId,
    targetUserId,
    targetUsername: targetUser.username,
    targetFullName: targetUser.fullName,
    reason,
  };
}

// =============================================================================
// Force Logout — revoke semua session user
// =============================================================================

export async function forceLogout(
  superadminId: string,
  targetUserId: string,
  reason: string
) {
  const revokedCount = await revokeAllUserSessions(targetUserId, superadminId, reason);

  await db.insert(auditLog).values({
    actorUserId: superadminId,
    action: "super.force_logout",
    entityTable: "user_session",
    entityId: targetUserId,
    after: { revokedCount, reason },
    isPrivileged: true,
  });

  return { targetUserId, revokedCount, reason };
}

// =============================================================================
// Reset Password
// =============================================================================

export async function resetPassword(
  superadminId: string,
  targetUserId: string,
  newPassword: string,
  requireChangeOnNextLogin: boolean
) {
  const [targetUser] = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(eq(user.id, targetUserId))
    .limit(1);

  if (!targetUser) throw new ServiceError("USER_NOT_FOUND", "User target tidak ditemukan.");

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(user)
    .set({ passwordHash })
    .where(eq(user.id, targetUserId));

  // Revoke semua session — user harus login ulang
  await revokeAllUserSessions(targetUserId, superadminId, "Password reset by SUPERADMIN");

  await db.insert(auditLog).values({
    actorUserId: superadminId,
    action: "super.reset_password",
    entityTable: "user",
    entityId: targetUserId,
    after: { requireChangeOnNextLogin, username: targetUser.username },
    isPrivileged: true,
  });

  return { targetUserId, username: targetUser.username, passwordReset: true };
}

// =============================================================================
// Assign SUPERADMIN (max 3 aktif)
// =============================================================================

export async function assignSuperadmin(
  superadminId: string,
  targetUserId: string,
  reason: string
) {
  // Cek limit 3
  const [superadminRole] = await db
    .select({ id: role.id })
    .from(role)
    .where(eq(role.code, "SUPERADMIN"))
    .limit(1);

  if (!superadminRole) throw new ServiceError("ROLE_NOT_FOUND", "Role SUPERADMIN tidak ditemukan.");

  const activeCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(userAssignment)
    .where(
      and(
        eq(userAssignment.roleId, superadminRole.id),
        isNull(userAssignment.revokedAt)
      )
    );

  if ((activeCount[0]?.count ?? 0) >= 3) {
    throw new ServiceError(
      "SUPERADMIN_LIMIT_REACHED",
      "Sudah ada 3 SUPERADMIN aktif. Revoke salah satu dulu sebelum menambah."
    );
  }

  await db.insert(userAssignment).values({
    userId: targetUserId,
    scopeType: "GLOBAL",
    scopeId: "00000000-0000-0000-0000-000000000000",
    roleId: superadminRole.id,
    assignedBy: superadminId,
  });

  await db.insert(auditLog).values({
    actorUserId: superadminId,
    action: "super.superadmin.assign",
    entityTable: "user_assignment",
    entityId: targetUserId,
    after: { reason, newCount: (activeCount[0]?.count ?? 0) + 1 },
    isPrivileged: true,
  });

  return { targetUserId, roleAssigned: "SUPERADMIN", reason };
}

// =============================================================================
// Get User Sessions
// =============================================================================

export async function getSuperUserSessions(targetUserId: string) {
  const sessions = await getUserSessions(targetUserId);
  return sessions;
}

// =============================================================================
// Revoke Specific Session
// =============================================================================

export async function revokeSpecificSession(
  superadminId: string,
  sessionId: string,
  reason: string
) {
  const [session] = await db
    .select()
    .from(userSession)
    .where(eq(userSession.id, sessionId))
    .limit(1);

  if (!session) throw new ServiceError("SESSION_NOT_FOUND", "Session tidak ditemukan.");

  await db
    .update(userSession)
    .set({
      revokedAt: new Date(),
      revokedBy: superadminId,
      revokedReason: reason,
    })
    .where(eq(userSession.id, sessionId));

  await db.insert(auditLog).values({
    actorUserId: superadminId,
    action: "super.session.revoke",
    entityTable: "user_session",
    entityId: sessionId,
    after: { reason, userId: session.userId, deviceType: session.deviceType },
    isPrivileged: true,
  });

  return { sessionId, revoked: true, reason };
}

// =============================================================================
// Revoke All Mobile Sessions for User
// =============================================================================

export async function revokeAllMobileSessions(
  superadminId: string,
  targetUserId: string,
  reason: string
) {
  const result = await db
    .update(userSession)
    .set({
      revokedAt: new Date(),
      revokedBy: superadminId,
      revokedReason: reason,
    })
    .where(
      and(
        eq(userSession.userId, targetUserId),
        eq(userSession.deviceType, "MOBILE"),
        isNull(userSession.revokedAt)
      )
    )
    .returning({ id: userSession.id });

  await db.insert(auditLog).values({
    actorUserId: superadminId,
    action: "super.session.revoke_mobile",
    entityTable: "user_session",
    entityId: targetUserId,
    after: { revokedCount: result.length, reason },
    isPrivileged: true,
  });

  return { targetUserId, revokedCount: result.length, reason };
}

// =============================================================================
// Get Audit Log (cross-tenant, privileged)
// =============================================================================

export async function getAuditLog(params: {
  entityTable?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const conditions = [];
  if (params.entityTable) conditions.push(eq(auditLog.entityTable, params.entityTable));
  if (params.entityId) conditions.push(eq(auditLog.entityId, params.entityId));

  const limit = Math.min(params.limit ?? 100, 500);

  const logs = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  // Resolve actor usernames
  const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter(Boolean))];
  const usernameMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const actorIdList = actorIds.map((id) => `'${id}'`).join(",");
    const actors = await db.execute(
      sql`SELECT id, username FROM "user" WHERE id IN (${sql.raw(actorIdList)})`
    );
    for (const a of (Array.isArray(actors) ? actors : []) as any[]) {
      if (a.id) usernameMap.set(String(a.id), String(a.username));
    }
  }

  return {
    data: logs.map((log) => ({
      ...log,
      actorUsername: (log.actorUserId ? usernameMap.get(log.actorUserId) : undefined) ?? null,
    })),
    total: logs.length,
  };
}

// =============================================================================
// Get Security Log (privileged actions, login failures, suspicious activity)
// =============================================================================

export async function getSecurityLog(params: {
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const limit = Math.min(params.limit ?? 50, 200);

  // Security log = privileged audit entries
  const logs = await db
    .select({
      id: auditLog.id,
      actorUserId: auditLog.actorUserId,
      action: auditLog.action,
      entityTable: auditLog.entityTable,
      entityId: auditLog.entityId,
      after: auditLog.after,
      isPrivileged: auditLog.isPrivileged,
      ipAddress: auditLog.ipAddress,
      userAgent: auditLog.userAgent,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.isPrivileged, true))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return { data: logs, total: logs.length };
}
