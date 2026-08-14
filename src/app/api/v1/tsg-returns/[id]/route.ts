// GET /api/v1/tsg-returns/:id — Detail retur (untuk cetak dokumen)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getTsgReturnDetail } from "@/lib/services/wms-inbound.service";

export const GET = withAuth(async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const detail = await getTsgReturnDetail(id);
  if (!detail) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Retur tidak ditemukan." }, requestId: ctx.requestId }, { status: 404 });
  }
  return NextResponse.json(detail, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });
