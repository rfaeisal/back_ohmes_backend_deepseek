// =============================================================================
// POST /api/v1/auth/switch-scope
// =============================================================================
// User dengan multiple assignment bisa switch active scope.
// Contoh: dari HQ_AUDITOR@COMPANY → PLANT_MANAGER@PLT-KDR-01
// =============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  extractToken,
  generateAccessToken,
  getAccessTokenTtl,
  resolveScope,
  type JwtPayload,
} from "@/lib/auth";

// =============================================================================
// Validation
// =============================================================================

const switchScopeSchema = z.object({
  scopeType: z.enum(["COMPANY", "REGION", "PLANT"]),
  scopeId: z.string().uuid("Scope ID tidak valid"),
});

// =============================================================================
// POST /api/v1/auth/switch-scope
// =============================================================================

export async function POST(request: Request) {
  const requestId =
    request.headers.get("X-Request-Id") ||
    `req_${crypto.randomUUID().slice(0, 8)}`;

  try {
    // -----------------------------------------------------------------------
    // 1. Extract JWT
    // -----------------------------------------------------------------------
    const currentPayload = await extractToken(request);
    if (!currentPayload) {
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

    // -----------------------------------------------------------------------
    // 2. Validasi input
    // -----------------------------------------------------------------------
    const body = await request.json();
    const parsed = switchScopeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Scope tidak valid.",
            details: parsed.error.flatten(),
          },
          requestId,
        },
        { status: 400 }
      );
    }

    const { scopeType, scopeId } = parsed.data;

    // -----------------------------------------------------------------------
    // 3. Resolve scope baru
    // -----------------------------------------------------------------------
    const resolvedScope = await resolveScope(
      currentPayload.userId,
      scopeType,
      scopeId
    );

    // -----------------------------------------------------------------------
    // 4. Generate access token baru dengan scope baru
    // -----------------------------------------------------------------------
    const isSuperadmin = resolvedScope.isPrivileged;
    const accessTokenTtl = getAccessTokenTtl(isSuperadmin);

    const jwtPayload: JwtPayload = {
      userId: currentPayload.userId,
      activeScopeType: resolvedScope.activeScopeType,
      activeScopeId: resolvedScope.activeScopeId,
      roleIds: resolvedScope.roleIds,
      plantIds: resolvedScope.plantIds,
      isPrivileged: resolvedScope.isPrivileged,
      sessionId: currentPayload.sessionId,
    };

    const accessToken = await generateAccessToken(jwtPayload, accessTokenTtl);

    // -----------------------------------------------------------------------
    // 5. Response
    // -----------------------------------------------------------------------
    return NextResponse.json(
      {
        accessToken,
        expiresIn: accessTokenTtl * 60,
        activeScope: {
          scopeType: resolvedScope.activeScopeType,
          scopeId: resolvedScope.activeScopeId,
        },
        assignments: resolvedScope.assignments,
        plantIds: resolvedScope.plantIds,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Switch-scope error:", err);
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
