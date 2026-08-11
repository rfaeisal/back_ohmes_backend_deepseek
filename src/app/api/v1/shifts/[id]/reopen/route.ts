// POST /shifts/:id/reopen — Reopen shift COMPLETED → RUNNING (pre-approval)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { reopenShift, ServiceError } from "@/lib/services/shift.service";

const schema = z.object({ reason: z.string().min(1, "Alasan reopen wajib") });

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });

      const result = await reopenShift(shiftId, parsed.data.reason);
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      throw err;
    }
  }
);
