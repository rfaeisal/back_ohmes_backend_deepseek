// =============================================================================
// Unit Tests — Auth: JWT, Password, Refresh Token
// =============================================================================

import { describe, it, expect } from "vitest";
// Import dari jwt.ts langsung untuk menghindari dependency ke db (session.ts)
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyPassword,
  hashRefreshToken,
  getAccessTokenTtl,
  getRefreshTokenTtlDays,
  type JwtPayload,
} from "@/lib/auth/jwt";

// =============================================================================
// Test Payload
// =============================================================================

const mockPayload: JwtPayload = {
  userId: "usr_test_01",
  activeScopeType: "PLANT",
  activeScopeId: "PLT-MLG-01",
  roleIds: ["role_operator_kecer"],
  plantIds: ["PLT-MLG-01"],
  isPrivileged: false,
};

// =============================================================================
// JWT Generation & Verification
// =============================================================================

describe("generateAccessToken & verifyAccessToken", () => {
  it("should generate and verify a valid token", async () => {
    const token = await generateAccessToken(mockPayload, 15);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const verified = await verifyAccessToken(token);
    expect(verified.userId).toBe(mockPayload.userId);
    expect(verified.activeScopeType).toBe(mockPayload.activeScopeType);
    expect(verified.plantIds).toEqual(mockPayload.plantIds);
    expect(verified.isPrivileged).toBe(false);
  });

  it("should verify SUPERADMIN token correctly", async () => {
    const superadminPayload: JwtPayload = {
      ...mockPayload,
      isPrivileged: true,
      activeScopeType: "GLOBAL",
      activeScopeId: null,
    };
    const token = await generateAccessToken(superadminPayload, 5);
    const verified = await verifyAccessToken(token);
    expect(verified.isPrivileged).toBe(true);
    expect(verified.activeScopeType).toBe("GLOBAL");
    expect(verified.activeScopeId).toBeNull();
  });

  it("should reject tampered token", async () => {
    const token = await generateAccessToken(mockPayload, 15);
    const tampered = token.slice(0, -5) + "xxxxx";
    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("should reject empty token", async () => {
    await expect(verifyAccessToken("")).rejects.toThrow();
  });

  it("should include all payload fields in token", async () => {
    const token = await generateAccessToken(mockPayload, 15);
    const verified = await verifyAccessToken(token);
    expect(verified.userId).toBe(mockPayload.userId);
    expect(verified.roleIds).toEqual(mockPayload.roleIds);
    expect(verified.plantIds).toEqual(mockPayload.plantIds);
  });
});

// =============================================================================
// Refresh Token Generation
// =============================================================================

describe("generateRefreshToken", () => {
  it("should generate a unique refresh token", () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^rft_/);
    expect(t1.length).toBeGreaterThan(40);
  });

  it("should generate tokens of consistent format", () => {
    for (let i = 0; i < 10; i++) {
      const token = generateRefreshToken();
      expect(token.startsWith("rft_")).toBe(true);
    }
  });
});

// =============================================================================
// Password Hashing
// =============================================================================

describe("hashPassword & verifyPassword", () => {
  it("should hash and verify a password", async () => {
    const password = "test-password-123";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash).toContain("$2b$"); // bcrypt hash prefix

    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("should reject wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });

  it("should generate different hashes for same password", async () => {
    const password = "same-password";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2); // Different salts
  });
});

// =============================================================================
// Refresh Token Hashing
// =============================================================================

describe("hashRefreshToken", () => {
  it("should hash token consistently", async () => {
    const token = "rft_abc123def456";
    const hash = await hashRefreshToken(token);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // SHA-256 hex is 64 chars
  });

  it("should produce deterministic hash", async () => {
    const token = "rft_test_token";
    const hash1 = await hashRefreshToken(token);
    const hash2 = await hashRefreshToken(token);
    expect(hash1).toBe(hash2);
  });
});

// =============================================================================
// TTL Configuration
// =============================================================================

describe("getAccessTokenTtl", () => {
  it("should return 5 minutes for superadmin", () => {
    expect(getAccessTokenTtl(true)).toBe(5);
  });

  it("should return default (15) for regular user", () => {
    expect(getAccessTokenTtl(false)).toBe(15);
  });
});

describe("getRefreshTokenTtlDays", () => {
  it("should return 7 days for superadmin", () => {
    expect(getRefreshTokenTtlDays(true)).toBe(7);
  });

  it("should return default (30) for regular user", () => {
    expect(getRefreshTokenTtlDays(false)).toBe(30);
  });
});
