// =============================================================================
// RBAC — Scope Expansion & Permission Evaluation
// =============================================================================

import type { JwtPayload } from "@/lib/auth";

// =============================================================================
// Types
// =============================================================================

export type ScopeType = "GLOBAL" | "COMPANY" | "REGION" | "PLANT";

export interface UserAssignmentRecord {
  userId: string;
  scopeType: ScopeType;
  scopeId: string;
  roleId: string;
  roleCode: string;
  roleScopeLevel: ScopeType;
  isPrivileged: boolean;
}

export interface ScopeExpansion {
  companyIds: string[];
  regionIds: string[];
  plantIds: string[];
}

// =============================================================================
// Scope Expansion — dari assignment ke daftar plant accessible
// =============================================================================

/**
 * Expand semua user_assignment aktif user ke daftar plant yang bisa diakses.
 * Result di-inject ke session postgres sebagai `app.current_plant_ids`.
 */
export async function expandScope(
  assignments: UserAssignmentRecord[]
): Promise<string[]> {
  const plantIds = new Set<string>();

  for (const assignment of assignments) {
    switch (assignment.scopeType) {
      case "GLOBAL":
        // SUPERADMIN — access all plants. Will be bypassed at RLS level.
        // For now, we need to get all plant IDs from DB.
        // This is handled separately by the scope resolver service.
        break;

      case "COMPANY":
        // Expand company → all regions → all plants
        // Implemented in scope-resolver service with DB queries
        break;

      case "REGION":
        // Expand region → all plants in region
        plantIds.add(assignment.scopeId);
        break;

      case "PLANT":
        // Direct plant access
        plantIds.add(assignment.scopeId);
        break;
    }
  }

  return Array.from(plantIds);
}

// =============================================================================
// Permission Check
// =============================================================================

/**
 * Cek apakah user (dari JWT payload) memiliki permission yang dibutuhkan.
 * Permission di-load dari DB via role_permission → user_assignment.
 */
export function hasPermission(
  payload: JwtPayload,
  requiredPermission: string
): boolean {
  // SUPERADMIN with isPrivileged always has all permissions
  if (payload.isPrivileged) {
    return true;
  }

  return (payload.permissions ?? []).includes(requiredPermission);
}

/**
 * Cek apakah user bisa mengakses plant tertentu
 */
export function canAccessPlant(
  payload: JwtPayload,
  plantId: string
): boolean {
  if (payload.isPrivileged) return true;
  return payload.plantIds.includes(plantId);
}
