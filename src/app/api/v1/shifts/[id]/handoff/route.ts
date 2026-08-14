// POST /api/v1/shifts/:id/handoff — Buat handoff antar shift
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createHandoff, ServiceError } from "@/lib/services/shift.service";

const handoffSchema = z.object({
  sisaTsgKg: z.number().min(0.01, "Berat sisa TSG harus > 0"),
  batanganSementaraKg: z.number().min(0.01, "Berat batangan sementara harus > 0"),
  note: z.string().optional(),
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
      const parsed = handoffSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const plantId = ctx.user.plantIds[0];
      if (!plantId) {
        return NextResponse.json(
          { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
          { status: 403 }
        );
      }

      const result = await createHandoff({
        shiftId,
        plantId,
        ...parsed.data,
        weighedBy: ctx.user.userId,
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "shift.handoff.create" }
);
