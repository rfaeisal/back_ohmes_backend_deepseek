// GET /api/v1/super/users/:id/sessions — Lihat semua session user
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getSuperUserSessions } from "@/lib/services/superadmin.service";

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    if (!ctx.user.isPrivileged) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Hanya SUPERADMIN." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await params;
    const sessions = await getSuperUserSessions(targetUserId);
    return NextResponse.json({ data: sessions }, { status: 200 });
  },
  { allowBypassRls: true,
  requiredPermission: "super.session.view" });
