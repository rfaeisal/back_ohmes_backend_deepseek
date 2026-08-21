// =============================================================================
// JWT — Token Generation, Verification, Password Hashing
// =============================================================================

import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";

// =============================================================================
// Types
// =============================================================================

export interface JwtPayload {
  userId: string;
  activeScopeType: "GLOBAL" | "COMPANY" | "REGION" | "PLANT";
  activeScopeId: string | null;
  roleIds: string[];
  plantIds: string[];
  isPrivileged: boolean;
  /** Kode permission yang di-resolve saat login/refresh dari role_permission */
  permissions?: string[];
  impersonatorId?: string;
  /** ID user_session penerbit token — dipakai untuk revoke instan (force-logout) */
  sessionId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // detik
}

// =============================================================================
// Configuration
// =============================================================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "CHANGE_ME_32_BYTES_HEX_STRING_MINIMUM_64_CHARS_LENGTH_REQUIRED"
);

const JWT_ISSUER = process.env.JWT_ISSUER || "mes.hummer";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "mes.hummer.api";

const DEFAULT_ACCESS_TTL = parseInt(
  process.env.JWT_ACCESS_TOKEN_TTL_MINUTES || "15"
);
const DEFAULT_REFRESH_TTL = parseInt(
  process.env.JWT_REFRESH_TOKEN_TTL_DAYS || "30"
);

// SUPERADMIN — lebih ketat
const SUPERADMIN_ACCESS_TTL = 5; // menit
const SUPERADMIN_REFRESH_TTL = 7; // hari

// =============================================================================
// Token Generation & Verification
// =============================================================================

export async function generateAccessToken(
  payload: JwtPayload,
  ttlMinutes?: number
): Promise<string> {
  const effectiveTtl = ttlMinutes ?? DEFAULT_ACCESS_TTL;

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(`${effectiveTtl}m`)
    .setJti(nanoid())
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return payload as unknown as JwtPayload;
}

export function generateRefreshToken(): string {
  return `rft_${nanoid(48)}`;
}

export function getAccessTokenTtl(isSuperadmin: boolean): number {
  return isSuperadmin ? SUPERADMIN_ACCESS_TTL : DEFAULT_ACCESS_TTL;
}

export function getRefreshTokenTtlDays(isSuperadmin: boolean): number {
  return isSuperadmin ? SUPERADMIN_REFRESH_TTL : DEFAULT_REFRESH_TTL;
}

// =============================================================================
// Password Hashing (bcrypt wrapper)
// =============================================================================

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcrypt");
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const bcrypt = await import("bcrypt");
  return bcrypt.compare(password, hash);
}

// =============================================================================
// Refresh Token Hashing (SHA-256)
// =============================================================================

export async function hashRefreshToken(token: string): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("sha256").update(token).digest("hex");
}
