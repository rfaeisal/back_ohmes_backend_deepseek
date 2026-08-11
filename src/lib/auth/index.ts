// =============================================================================
// Auth Barrel Export
// =============================================================================

// Core JWT & Password
export {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyPassword,
  hashRefreshToken,
  getAccessTokenTtl,
  getRefreshTokenTtlDays,
  type JwtPayload,
  type TokenPair,
} from "./jwt";

// Session Management
export {
  createSession,
  validateAndRotateSession,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions,
  cleanupExpiredSessions,
  SessionExistsError,
  type CreateSessionInput,
  type SessionInfo,
} from "./session";

// Scope Resolver
export {
  resolveScope,
  resolveScopeFromSession,
  type ResolvedScope,
} from "./scope-resolver";

// Auth Middleware
export {
  withAuth,
  extractToken,
  type AuthContext,
} from "./middleware";
