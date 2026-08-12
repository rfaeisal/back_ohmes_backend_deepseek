// GET /api/v1/audit — Audit log untuk semua authenticated user
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getAuditLog } from "@/lib/services/superadmin.service";

export const GET = withAuth(async (request: Request, _ctx: AuthContext) => {
  const url = new URL(request.url);
  const result = await getAuditLog({
    entityTable: url.searchParams.get("entityTable") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: parseInt(url.searchParams.get("limit") ?? "100"),
  });

  return NextResponse.json(result, { status: 200 });
});
