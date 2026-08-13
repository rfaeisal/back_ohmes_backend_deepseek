// POST /shifts/:id/correct — CORRECTION shift APPROVED (HQ_AUDITOR)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createCorrection, ServiceError } from "@/lib/services/correction.service";

const schema = z.object({
  correctionFields: z.array(z.object({ path: z.string().min(1), newValue: z.unknown(), reason: z.string().min(1) })).min(1),
  notes: z.string().optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });

      const result = await createCorrection({ shiftId, correctionFields: parsed.data.correctionFields as any, notes: parsed.data.notes, correctedBy: ctx.user.userId });
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId }, { status: 409 });
      throw err;
    }
  },
  { requiredPermission: "shift.correct" }
);
