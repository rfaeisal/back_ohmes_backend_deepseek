// GET /api/v1/super/audit — Audit log cross-tenant (SUPERADMIN only)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getAuditLog } from "@/lib/services/superadmin.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  if (!ctx.user.isPrivileged) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Hanya SUPERADMIN." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const result = await getAuditLog({
    entityTable: url.searchParams.get("entityTable") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    limit: parseInt(url.searchParams.get("limit") ?? "100"),
  });

  return NextResponse.json(result, { status: 200 });
}, { allowBypassRls: true });
