// =============================================================================
// Auth Middleware — Wrap API Route Handler
// =============================================================================
// Usage:
//   export const POST = withAuth(async (request, ctx) => {
//     // ctx.user berisi JWT payload + scope yang sudah di-resolve
//     // RLS context sudah di-set
//   });
//
// Atau dengan permission check:
//   export const POST = withAuth(
//     async (request, ctx) => { ... },
//     { requiredPermission: "shift.approve" }
//   );
// =============================================================================

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import db from "@/db";
import { userSession } from "@/db/schema/identity";
import { verifyAccessToken, type JwtPayload } from "@/lib/auth";
import { setRlsContext } from "@/lib/rls";

// =============================================================================
// Types
// =============================================================================

export interface AuthContext {
  user: JwtPayload;
  requestId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthHandler = (...args: any[]) => Promise<NextResponse>;

interface AuthOptions {
  requiredPermission?: string;
  allowBypassRls?: boolean;
}

// =============================================================================
// withAuth — High-order function untuk API route handlers
// =============================================================================

export function withAuth(
  handler: AuthHandler,
  options?: AuthOptions
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function (request: Request, ...args: any[]): Promise<NextResponse> {
    const requestId =
      request.headers.get("X-Request-Id") ||
      `req_${crypto.randomUUID().slice(0, 8)}`;

    try {
      // 1. Extract Authorization header
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Token tidak ditemukan. Silakan login.",
            },
            requestId,
          },
          { status: 401 }
        );
      }

      const token = authHeader.slice(7);

      // 2. Verify JWT
      let payload: JwtPayload;
      try {
        payload = await verifyAccessToken(token);
      } catch {
        return NextResponse.json(
          {
            error: {
              code: "TOKEN_EXPIRED",
              message: "Sesi telah berakhir. Silakan login kembali.",
            },
            requestId,
          },
          { status: 401 }
        );
      }

      // 2b. Revoke instan — sesi di-revoke = access token langsung mati
      if (!(await checkSessionActive(payload))) {
        return NextResponse.json(
          {
            error: {
              code: "TOKEN_REVOKED",
              message: "Sesi telah diakhiri. Silakan login kembali.",
            },
            requestId,
          },
          { status: 401 }
        );
      }

      // 3. Permission check (opsional)
      if (options?.requiredPermission) {
        // SUPERADMIN with isPrivileged always has all permissions
        if (!payload.isPrivileged && !(payload.permissions ?? []).includes(options.requiredPermission)) {
          return NextResponse.json(
            {
              error: {
                code: "FORBIDDEN",
                message: `Permission '${options.requiredPermission}' diperlukan.`,
              },
              requestId,
            },
            { status: 403 }
          );
        }
      }

      // 4. Set RLS context
      await setRlsContext({
        plantIds: payload.plantIds,
        userId: payload.userId,
        roleIds: payload.roleIds,
        bypassRls: payload.isPrivileged && (options?.allowBypassRls ?? false),
      });

      // 5. Call handler dengan context + route params
      const routeArg = args[0] as { params: Promise<Record<string, string>> } | undefined;
      const response = routeArg
        ? await handler(request, { user: payload, requestId }, routeArg)
        : await handler(request, { user: payload, requestId });

      // 6. Inject request ID ke response
      response.headers.set("X-Request-Id", requestId);

      return response;
    } catch (err) {
      console.error("Auth middleware error:", err);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Terjadi kesalahan internal",
          },
          requestId,
        },
        { status: 500 }
      );
    }
  };
}

// =============================================================================
// checkSessionActive — revoke instan (dipakai withAuth & extractToken)
// =============================================================================
// Access token terikat ke user_session via payload.sessionId. Kalau sesi
// di-revoke (force-logout / revoke endpoint), token langsung mati tanpa
// menunggu TTL. Token lama (pra-fix) tanpa sessionId dibiarkan —
// kedaluwarsa maksimal 15 menit (TTL access token).
// =============================================================================

export async function checkSessionActive(payload: JwtPayload): Promise<boolean> {
  if (!payload.sessionId) return true;

  const [sess] = await db
    .select({ id: userSession.id })
    .from(userSession)
    .where(
      and(eq(userSession.id, payload.sessionId), isNull(userSession.revokedAt))
    )
    .limit(1);

  return !!sess;
}

// =============================================================================
// extractToken — untuk endpoint yang butuh token tanpa full middleware
// =============================================================================

export async function extractToken(
  request: Request
): Promise<JwtPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    if (!(await checkSessionActive(payload))) return null;
    return payload;
  } catch {
    return null;
  }
}
