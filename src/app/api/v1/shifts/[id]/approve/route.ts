// POST /api/v1/shifts/:id/approve — Approve shift → LOCKED
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { approveShift, ServiceError } from "@/lib/services/shift.service";

const approveSchema = z.object({
  reviewNotes: z.string().optional(),
});

export const POST = withAuth(
  async (
    request: Request,
    ctx: AuthContext,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id: shiftId } = await params;
      const body = await request.json();
      const parsed = approveSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await approveShift(shiftId, ctx.user.userId, parsed.data.reviewNotes);

      return NextResponse.json(
        {
          shiftId: result!.id,
          status: result!.status,
          approvedAt: result!.approvedAt,
          approvedBy: result!.approvedBy,
        },
        { status: 200 }
      );
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  }
);
