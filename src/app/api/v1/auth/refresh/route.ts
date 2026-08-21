// =============================================================================
// POST /api/v1/auth/refresh
// =============================================================================
// Rotate refresh token → dapatkan access token baru.
// Refresh token lama di-invalidate, yang baru bisa dipakai untuk next refresh.
// =============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import db from "@/db";
import { rolePermission, permission } from "@/db/schema/identity";
import {
  generateAccessToken,
  validateAndRotateSession,
  resolveScope,
  getAccessTokenTtl,
  type JwtPayload,
} from "@/lib/auth";

// =============================================================================
// Validation
// =============================================================================

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token wajib"),
});

// =============================================================================
// POST /api/v1/auth/refresh
// =============================================================================

export async function POST(request: Request) {
  const requestId =
    request.headers.get("X-Request-Id") ||
    `req_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Refresh token tidak valid.",
          },
          requestId,
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------------
    // 1. Validate & rotate refresh token
    // -----------------------------------------------------------------------
    const result = await validateAndRotateSession(parsed.data.refreshToken);

    if (!result) {
      return NextResponse.json(
        {
          error: {
            code: "REFRESH_TOKEN_INVALID",
            message: "Refresh token invalid atau expired. Silakan login kembali.",
          },
          requestId,
        },
        { status: 401 }
      );
    }

    const { session } = result;

    // -----------------------------------------------------------------------
    // 2. Resolve scope dari session
    // -----------------------------------------------------------------------
    const resolvedScope = await resolveScope(
      session.userId,
      session.activeScopeType,
      session.activeScopeId ?? undefined
    );

    // -----------------------------------------------------------------------
    // 3. Resolve permission codes dari role_permission
    // -----------------------------------------------------------------------
    const permissionCodes = resolvedScope.roleIds.length > 0
      ? (await db
          .select({ code: permission.code })
          .from(rolePermission)
          .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
          .where(inArray(rolePermission.roleId, resolvedScope.roleIds)))
          .map((p) => p.code)
      : [];

    // -----------------------------------------------------------------------
    // 4. Generate access token baru
    // -----------------------------------------------------------------------
    const isSuperadmin = resolvedScope.isPrivileged;
    const accessTokenTtl = getAccessTokenTtl(isSuperadmin);

    const jwtPayload: JwtPayload = {
      userId: session.userId,
      activeScopeType: resolvedScope.activeScopeType,
      activeScopeId: resolvedScope.activeScopeId,
      roleIds: resolvedScope.roleIds,
      plantIds: resolvedScope.plantIds,
      isPrivileged: resolvedScope.isPrivileged,
      permissions: permissionCodes,
      sessionId: session.id,
    };

    const accessToken = await generateAccessToken(jwtPayload, accessTokenTtl);

    // -----------------------------------------------------------------------
    // 4. Response
    // -----------------------------------------------------------------------
    return NextResponse.json(
      {
        accessToken,
        refreshToken: result.newRefreshToken,
        expiresIn: accessTokenTtl * 60,
        user: {
          id: session.userId,
          // fullName dari DB akan di-resolve nanti
          fullName: "",
          username: "",
        },
        assignments: resolvedScope.assignments,
        activeScope: {
          scopeType: resolvedScope.activeScopeType,
          scopeId: resolvedScope.activeScopeId,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Refresh error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Terjadi kesalahan internal.",
        },
        requestId,
      },
      { status: 500 }
    );
  }
}
