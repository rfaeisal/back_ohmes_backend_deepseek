// POST /api/v1/super/users/:id/force-logout — Revoke semua session user
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { forceLogout, ServiceError } from "@/lib/services/superadmin.service";

const schema = z.object({ reason: z.string().min(1, "Alasan force logout wajib") });

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    if (!ctx.user.isPrivileged) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Hanya SUPERADMIN." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    try {
      const { id: targetUserId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid." }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await forceLogout(ctx.user.userId, targetUserId, parsed.data.reason);
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { allowBypassRls: true,
  requiredPermission: "super.force_logout" });
