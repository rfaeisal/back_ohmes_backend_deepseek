// POST /api/v1/super/sessions/:id/revoke
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { revokeSpecificSession, ServiceError } from "@/lib/services/superadmin.service";

const schema = z.object({ reason: z.string().optional() });

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    if (!ctx.user.isPrivileged) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya SUPERADMIN." }, requestId: ctx.requestId }, { status: 403 });
    }
    try {
      const { id: sessionId } = await params;
      const body = await request.json().catch(() => ({}));
      const parsed = schema.safeParse(body);
      const result = await revokeSpecificSession(ctx.user.userId, sessionId, parsed.data?.reason ?? "Admin revoke");
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId }, { status: 409 });
      throw err;
    }
  },
  { allowBypassRls: true,
  requiredPermission: "super.session.revoke" });
