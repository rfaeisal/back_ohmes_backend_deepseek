// GET /api/v1/external-receivings/:id — detail penerimaan external
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getExternalReceivingDetail } from "@/lib/services/makloon.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const d = await getExternalReceivingDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Penerimaan external tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }
    return NextResponse.json(d, { status: 200 });
  },
  { requiredPermission: "tsg.receiving.view" }
);
