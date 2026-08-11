// POST /shifts/:id/correct — CORRECTION shift LOCKED (HQ_AUDITOR only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createCorrection, ServiceError } from "@/lib/services/correction.service";

const correctionSchema = z.object({
  correctionFields: z.array(
    z.object({
      path: z.string().min(1),
      newValue: z.unknown(),
      reason: z.string().min(1, "Alasan koreksi wajib"),
    })
  ).min(1),
  notes: z.string().optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftId } = await params;
      const body = await request.json();
      const parsed = correctionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await createCorrection({
        shiftId,
        ...parsed.data,
        correctedBy: ctx.user.userId,
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  }
);
