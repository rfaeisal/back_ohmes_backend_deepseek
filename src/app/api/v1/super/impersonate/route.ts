// POST /api/v1/super/impersonate — Login as other user
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import db from "@/db";
import { rolePermission, permission } from "@/db/schema/identity";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { impersonateUser, ServiceError } from "@/lib/services/superadmin.service";
import { generateAccessToken, getAccessTokenTtl, type JwtPayload } from "@/lib/auth/jwt";
import { resolveScope } from "@/lib/auth/scope-resolver";

const schema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(1, "Alasan impersonate wajib"),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  if (!ctx.user.isPrivileged) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Hanya SUPERADMIN." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    await impersonateUser(ctx.user.userId, parsed.data.userId, parsed.data.reason);

    // Generate JWT dengan impersonatorId + sessionId impersonator (token ikut
    // mati saat sesi SUPERADMIN di-revoke) + permissions target.
    const resolvedScope = await resolveScope(parsed.data.userId);
    const permissionCodes = resolvedScope.roleIds.length > 0
      ? (await db
          .select({ code: permission.code })
          .from(rolePermission)
          .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
          .where(inArray(rolePermission.roleId, resolvedScope.roleIds)))
          .map((p) => p.code)
      : [];

    const jwtPayload: JwtPayload = {
      userId: parsed.data.userId,
      activeScopeType: resolvedScope.activeScopeType,
      activeScopeId: resolvedScope.activeScopeId,
      roleIds: resolvedScope.roleIds,
      plantIds: resolvedScope.plantIds,
      isPrivileged: false,
      impersonatorId: ctx.user.userId,
      permissions: permissionCodes,
      sessionId: ctx.user.sessionId,
    };

    const accessToken = await generateAccessToken(jwtPayload, getAccessTokenTtl(false));

    return NextResponse.json({
      accessToken,
      expiresIn: getAccessTokenTtl(false) * 60,
      impersonatorId: ctx.user.userId,
      targetUser: { id: parsed.data.userId },
      reason: parsed.data.reason,
    }, { status: 200 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: (err as ServiceError).message }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    throw err;
  }
},
  { allowBypassRls: true,
  requiredPermission: "super.impersonate" });
