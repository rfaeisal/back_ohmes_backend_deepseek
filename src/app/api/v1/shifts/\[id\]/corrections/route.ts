// GET /shifts/:id/corrections — Lihat riwayat koreksi shift
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getShiftCorrections } from "@/lib/services/correction.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id: shiftId } = await params;
    const result = await getShiftCorrections(shiftId);
    return NextResponse.json(result, { status: 200 });
  }
);
