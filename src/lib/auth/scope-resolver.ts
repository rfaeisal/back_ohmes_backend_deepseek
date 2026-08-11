// =============================================================================
// Scope Resolver — Expand UserAssignment → Plant IDs
// =============================================================================
// Dari user_assignment, resolve semua plant yang bisa diakses user.
// Hasil di-inject ke JWT payload dan RLS session context.
// =============================================================================

import db from "@/db";
import { userAssignment, role, userSession } from "@/db/schema/identity";
import { plant, region } from "@/db/schema/tenancy";
import { and, eq, isNull, inArray } from "drizzle-orm";

// =============================================================================
// Types
// =============================================================================

export interface ResolvedScope {
  userId: string;
  activeScopeType: "GLOBAL" | "COMPANY" | "REGION" | "PLANT";
  activeScopeId: string | null;
  roleIds: string[];
  plantIds: string[];
  isPrivileged: boolean;
  assignments: Array<{
    scopeType: string;
    scopeId: string;
    scopeName: string;
    roleCode: string;
  }>;
}

// =============================================================================
// Resolve scope dari user assignment aktif
// =============================================================================

export async function resolveScope(
  userId: string,
  activeScopeType?: string,
  activeScopeId?: string
): Promise<ResolvedScope> {
  // 1. Ambil semua user_assignment aktif
  const assignments = await db
    .select({
      scopeType: userAssignment.scopeType,
      scopeId: userAssignment.scopeId,
      roleId: userAssignment.roleId,
      roleCode: role.code,
      roleScopeLevel: role.scopeLevel,
      isPrivileged: role.isPrivileged,
    })
    .from(userAssignment)
    .innerJoin(role, eq(userAssignment.roleId, role.id))
    .where(
      and(
        eq(userAssignment.userId, userId),
        isNull(userAssignment.revokedAt)
      )
    );

  if (assignments.length === 0) {
    throw new Error("NO_ASSIGNMENT: User tidak memiliki assignment aktif");
  }

  // 2. Tentukan active scope
  let effectiveScopeType = activeScopeType ?? assignments[0]!.scopeType;
  let effectiveScopeId = activeScopeId ?? assignments[0]!.scopeId;

  // Validasi: assignment harus cover scope yang diminta
  const hasScopeAssignment = assignments.some(
    (a) => a.scopeType === effectiveScopeType && a.scopeId === effectiveScopeId
  );
  if (!hasScopeAssignment) {
    // Fallback ke assignment pertama
    effectiveScopeType = assignments[0]!.scopeType;
    effectiveScopeId = assignments[0]!.scopeId;
  }

  // 3. Cek apakah user SUPERADMIN (isPrivileged)
  const isPrivileged = assignments.some((a) => a.isPrivileged);

  // 4. Expand scope → plant IDs
  const plantIds = await expandToPlantIds(
    effectiveScopeType,
    effectiveScopeId ?? "",
    isPrivileged
  );

  // 5. Kumpulkan role IDs
  const roleIds = [...new Set(assignments.map((a) => a.roleId))];

  // 6. Format assignments untuk response
  const formattedAssignments = assignments.map((a) => ({
    scopeType: a.scopeType,
    scopeId: a.scopeId,
    scopeName: "", // TODO: resolve nama dari company/region/plant
    roleCode: a.roleCode,
  }));

  return {
    userId,
    activeScopeType: effectiveScopeType as ResolvedScope["activeScopeType"],
    activeScopeId: effectiveScopeId,
    roleIds,
    plantIds,
    isPrivileged,
    assignments: formattedAssignments,
  };
}

// =============================================================================
// Expand scope → plant IDs
// =============================================================================

async function expandToPlantIds(
  scopeType: string,
  scopeId: string,
  bypassRls: boolean
): Promise<string[]> {
  if (bypassRls) {
    // SUPERADMIN — ambil semua plant
    const allPlants = await db.select({ id: plant.id }).from(plant);
    return allPlants.map((p) => p.id);
  }

  switch (scopeType) {
    case "COMPANY": {
      // Company → semua region → semua plant
      const regions = await db
        .select({ id: region.id })
        .from(region)
        .where(eq(region.companyId, scopeId));

      if (regions.length === 0) return [];

      const regionIds = regions.map((r) => r.id);
      const plants = await db
        .select({ id: plant.id })
        .from(plant)
        .where(inArray(plant.regionId, regionIds));

      return plants.map((p) => p.id);
    }

    case "REGION": {
      // Region → semua plant dalam region
      const plants = await db
        .select({ id: plant.id })
        .from(plant)
        .where(eq(plant.regionId, scopeId));

      return plants.map((p) => p.id);
    }

    case "PLANT": {
      return [scopeId];
    }

    case "GLOBAL": {
      return []; // SUPERADMIN, bypass via isPrivileged
    }

    default:
      return [];
  }
}

// =============================================================================
// Resolve dari session aktif
// =============================================================================

export async function resolveScopeFromSession(
  sessionId: string
): Promise<ResolvedScope | null> {
  const [session] = await db
    .select()
    .from(userSession)
    .where(
      and(eq(userSession.id, sessionId), isNull(userSession.revokedAt))
    )
    .limit(1);

  if (!session) return null;

  return resolveScope(
    session.userId,
    session.activeScopeType,
    session.activeScopeId ?? undefined
  );
}
