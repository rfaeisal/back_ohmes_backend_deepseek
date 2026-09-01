// GET /api/v1/hlp/shifts/:id — detail sesi HLP (anggota + packing tercatat)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getHlpShiftDetail } from "@/lib/services/hlp-session.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const detail = await getHlpShiftDetail(id);
    if (!detail) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Sesi HLP tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }
    return NextResponse.json(detail, { status: 200 });
  },
  { requiredPermission: "hlp.pack" }
);
