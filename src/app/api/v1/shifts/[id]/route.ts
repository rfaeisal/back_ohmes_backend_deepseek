// GET /api/v1/shifts/:id — Detail shift lengkap
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getShiftDetail, ServiceError } from "@/lib/services/shift.service";

export const GET = withAuth(
  async (
    _request: Request,
    ctx: AuthContext,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id: shiftId } = await params;
      const detail = await getShiftDetail(shiftId);
      return NextResponse.json(detail, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 404 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "shift.view" }
);
