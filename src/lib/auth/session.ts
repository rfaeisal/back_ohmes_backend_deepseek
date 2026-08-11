// =============================================================================
// Session Service — Create, Validate, Revoke user sessions
// =============================================================================
// Menangani lifecycle user_session: login (create), refresh (rotate),
// logout (revoke), dan single-session mobile enforcement.
// =============================================================================

import db from "@/db";
import {
  userSession,
  user,
} from "@/db/schema/identity";
import { and, eq, isNull, sql, lt } from "drizzle-orm";
import { hashRefreshToken } from "@/lib/auth";

// =============================================================================
// Types
// =============================================================================

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  activeScopeType: string;
  activeScopeId: string | null;
  deviceType: "MOBILE" | "WEB";
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  pushToken?: string;
  expiresAt: Date;
}

export interface SessionInfo {
  id: string;
  userId: string;
  deviceType: string;
  deviceName: string | null;
  deviceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: Date;
  loginAt: Date;
  expiresAt: Date;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

// =============================================================================
// Create Session
// =============================================================================

export async function createSession(
  input: CreateSessionInput
): Promise<string> {
  // Single-session mobile enforcement
  if (input.deviceType === "MOBILE") {
    if (!input.deviceId) {
      throw new Error("DEVICE_ID_REQUIRED: deviceId wajib untuk MOBILE");
    }

    // Cek sesi mobile aktif existing
    const [existingMobile] = await db
      .select()
      .from(userSession)
      .where(
        and(
          eq(userSession.userId, input.userId),
          eq(userSession.deviceType, "MOBILE"),
          isNull(userSession.revokedAt),
          sql`expires_at > now()`
        )
      )
      .limit(1);

    if (existingMobile) {
      // Sama device? Auto-revoke sesi lama (case: reinstall app)
      if (existingMobile.deviceId === input.deviceId) {
        await db
          .update(userSession)
          .set({
            revokedAt: new Date(),
            revokedReason: "Auto-revoke: re-login di device sama",
          })
          .where(eq(userSession.id, existingMobile.id));
      } else {
        // Device berbeda → tolak!
        throw new SessionExistsError(
          "Akun Anda sedang aktif di device lain. Hubungi Super Admin untuk memutus sesi.",
          {
            deviceName: existingMobile.deviceName,
            deviceId: maskDeviceId(existingMobile.deviceId ?? ""),
            lastActiveAt: existingMobile.lastActiveAt,
            ipAddressMasked: maskIp(existingMobile.ipAddress ?? ""),
            loginAt: existingMobile.createdAt,
          }
        );
      }
    }
  }

  // Create session
  const [session] = await db
    .insert(userSession)
    .values({
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      activeScopeType: input.activeScopeType,
      activeScopeId: input.activeScopeId,
      deviceType: input.deviceType,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      pushToken: input.pushToken,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      lastActiveAt: new Date(),
      expiresAt: input.expiresAt,
    })
    .returning();

  if (!session) {
    throw new Error("SESSION_CREATE_FAILED");
  }

  return session.id;
}

// =============================================================================
// Validate Session (untuk refresh token)
// =============================================================================

export async function validateAndRotateSession(
  refreshToken: string
): Promise<{
  session: typeof userSession.$inferSelect;
  newRefreshToken: string;
  newRefreshTokenHash: string;
} | null> {
  const tokenHash = await hashRefreshToken(refreshToken);

  // Cari session dengan refresh token hash yang cocok
  const sessions = await db
    .select()
    .from(userSession)
    .where(
      and(
        eq(userSession.refreshTokenHash, tokenHash),
        isNull(userSession.revokedAt),
        sql`expires_at > now()`
      )
    )
    .limit(1);

  const session = sessions[0];
  if (!session) return null;

  // Generate new refresh token (rotation)
  const { generateRefreshToken, hashRefreshToken: hashToken } = await import(
    "@/lib/auth"
  );
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = await hashToken(newRefreshToken);

  // Update session dengan hash baru
  await db
    .update(userSession)
    .set({
      refreshTokenHash: newRefreshTokenHash,
      lastActiveAt: new Date(),
    })
    .where(eq(userSession.id, session.id));

  return { session, newRefreshToken, newRefreshTokenHash };
}

// =============================================================================
// Revoke Session
// =============================================================================

export async function revokeSession(
  sessionId: string,
  revokedBy?: string,
  reason?: string
): Promise<void> {
  await db
    .update(userSession)
    .set({
      revokedAt: new Date(),
      revokedBy: revokedBy ?? null,
      revokedReason: reason ?? null,
    })
    .where(eq(userSession.id, sessionId));
}

export async function revokeAllUserSessions(
  userId: string,
  _revokedBy?: string,
  _reason?: string
): Promise<number> {
  const result = await db
    .update(userSession)
    .set({
      revokedAt: new Date(),
      revokedBy: _revokedBy ?? null,
      revokedReason: _reason ?? null,
    })
    .where(
      and(eq(userSession.userId, userId), isNull(userSession.revokedAt))
    )
    .returning({ id: userSession.id });

  return result.length;
}

// =============================================================================
// Get Sessions
// =============================================================================

export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await db
    .select()
    .from(userSession)
    .where(and(eq(userSession.userId, userId), isNull(userSession.revokedAt)))
    .orderBy(userSession.lastActiveAt);

  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    deviceType: s.deviceType,
    deviceName: s.deviceName,
    deviceId: s.deviceId ? maskDeviceId(s.deviceId) : null,
    ipAddress: s.ipAddress ? maskIp(s.ipAddress) : null,
    userAgent: s.userAgent,
    lastActiveAt: s.lastActiveAt,
    loginAt: s.createdAt,
    expiresAt: s.expiresAt,
    status: new Date() > s.expiresAt ? ("EXPIRED" as const) : ("ACTIVE" as const),
  }));
}

// =============================================================================
// Check SUPERADMIN limits
// =============================================================================

export async function checkSuperadminLimit(
  _superadminRoleId: string,
  maxActive: number
): Promise<boolean> {
  const activeCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(userSession)
    .innerJoin(user, eq(userSession.userId, user.id))
    .where(
      and(
        isNull(userSession.revokedAt),
        sql`expires_at > now()`
      )
    );

  // Simplified — actual implementation checks role assignment
  return (activeCount[0]?.count ?? 0) < maxActive;
}

// =============================================================================
// Cleanup expired sessions
// =============================================================================

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .update(userSession)
    .set({
      revokedAt: new Date(),
      revokedReason: "Auto-cleanup: expired",
    })
    .where(
      and(isNull(userSession.revokedAt), lt(userSession.expiresAt, new Date()))
    )
    .returning({ id: userSession.id });

  return result.length;
}

// =============================================================================
// Error Classes
// =============================================================================

export class SessionExistsError extends Error {
  public code = "SESSION_EXISTS";
  public activeSession: Record<string, unknown>;

  constructor(
    message: string,
    activeSession: Record<string, unknown>
  ) {
    super(message);
    this.name = "SessionExistsError";
    this.activeSession = activeSession;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function maskDeviceId(deviceId: string): string {
  if (deviceId.length <= 8) return `${deviceId.slice(0, 4)}…`;
  return `${deviceId.slice(0, 4)}… (masked)`;
}

function maskIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return `${ip.slice(0, 7)}***`;
}
