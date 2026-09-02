// GET /finished-goods/:shiftId — daftar ekspektasi FG per unit (PACK/SLOP/BAL)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getFinishedGoodsForShift, ServiceError } from "@/lib/services/wms-outbound.service";

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ shiftId: string }> }) => {
    try {
      const { shiftId } = await params;
      const data = await getFinishedGoodsForShift(shiftId);
      return NextResponse.json({ data }, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 400 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "finishedgoods.view" }
);
