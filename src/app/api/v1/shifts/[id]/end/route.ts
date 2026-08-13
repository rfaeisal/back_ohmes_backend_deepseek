// PATCH /api/v1/shifts/:id/end — Akhiri shift
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { endShift, ServiceError } from "@/lib/services/shift.service";

const endSchema = z.object({
  waste: z
    .array(
      z.object({
        category: z.enum(["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"]),
        kg: z.number().min(0),
        settlementStatus: z.enum(["PENDING", "LUNAS"]),
      })
    )
    .length(4, "Wajib 4 kategori waste"),
  notes: z.string().optional(),
});

export const PATCH = withAuth(
  async (
    request: Request,
    ctx: AuthContext,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    try {
      const { id: shiftId } = await params;
      const body = await request.json();
      const parsed = endSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await endShift({ shiftId, ...parsed.data });

      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        const status = err.code === "SHIFT_HAS_ACTIVE_BOX" ? 409 : 400;
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
          { status }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "shift.end" }
);
