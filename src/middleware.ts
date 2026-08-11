import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware Next.js — handling untuk:
 * - CORS headers
 * - Rate limiting (basic — diperkuat di API layer)
 * - API request ID injection
 * - Auth check bypass untuk public endpoints
 */

// Reserved for future use — allowlist public paths that skip auth
// const PUBLIC_PATHS = [...];

const RATE_LIMIT_MAP = new Map<string, { count: number; resetAt: number }>();

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CORS headers
  const origin = request.headers.get("origin") || "*";
  const response = NextResponse.next();

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Idempotency-Key, X-Request-Id"
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  // Inject request ID
  const requestId =
    request.headers.get("X-Request-Id") ||
    `req_${crypto.randomUUID().slice(0, 8)}`;
  response.headers.set("X-Request-Id", requestId);

  // Basic rate limiting untuk API routes
  if (pathname.startsWith("/api/")) {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1";
    const now = Date.now();
    const limitKey = `${clientIp}:${pathname}`;
    const current = RATE_LIMIT_MAP.get(limitKey);

    if (current) {
      if (now < current.resetAt && current.count >= 100) {
        return NextResponse.json(
          {
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Terlalu banyak request. Coba lagi nanti.",
            },
            requestId,
          },
          { status: 429, headers: response.headers }
        );
      }

      if (now >= current.resetAt) {
        RATE_LIMIT_MAP.set(limitKey, {
          count: 1,
          resetAt: now + 60_000,
        });
      } else {
        current.count++;
      }
    } else {
      RATE_LIMIT_MAP.set(limitKey, {
        count: 1,
        resetAt: now + 60_000,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
