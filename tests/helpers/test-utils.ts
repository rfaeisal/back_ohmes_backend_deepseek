// =============================================================================
// Test Utilities — Helper untuk unit & integration test
// =============================================================================

import { type JwtPayload } from "@/lib/auth";

/**
 * Create mock JWT payload untuk testing
 */
export function createMockPayload(
  overrides: Partial<JwtPayload> = {}
): JwtPayload {
  return {
    userId: "usr_test_01",
    activeScopeType: "PLANT",
    activeScopeId: "PLT-MLG-01",
    roleIds: ["role_op_kecer"],
    plantIds: ["PLT-MLG-01"],
    isPrivileged: false,
    ...overrides,
  };
}

/**
 * Create mock SUPERADMIN JWT payload
 */
export function createMockSuperadminPayload(): JwtPayload {
  return createMockPayload({
    userId: "usr_super_01",
    activeScopeType: "GLOBAL",
    activeScopeId: null,
    roleIds: ["role_superadmin"],
    plantIds: ["PLT-MLG-01", "PLT-KDR-01"],
    isPrivileged: true,
  });
}

/**
 * Seed data untuk testing — factory functions
 */
export const TEST_DATA = {
  PLANT_MLG: "00000000-0000-0000-0000-000000000001",
  PLANT_KDR: "00000000-0000-0000-0000-000000000002",
  MACHINE_MKR01: "00000000-0000-0000-0000-000000000010",
  MACHINE_MKR02: "00000000-0000-0000-0000-000000000011",
  PRODUCT_HMR: "00000000-0000-0000-0000-000000000020",
  USER_OPERATOR: "00000000-0000-0000-0000-000000000030",
  USER_SUPERVISOR: "00000000-0000-0000-0000-000000000031",
  USER_SUPERADMIN: "00000000-0000-0000-0000-000000000032",
  SHIFT_MLG_01: "00000000-0000-0000-0000-000000000040",
} as const;
