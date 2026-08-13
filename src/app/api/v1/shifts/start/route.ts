// POST /api/v1/shifts/start — Mulai shift baru
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { startShift, ServiceError } from "@/lib/services/shift.service";

const startSchema = z.object({
  machineId: z.string().uuid(),
  productId: z.string().uuid(),
  shiftTemplateId: z.string().uuid(),
  members: z
    .array(
      z.object({
        userId: z.string().uuid(),
        shiftRoleId: z.string().uuid(),
      })
    )
    .min(1, "Minimal 1 anggota tim"),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = startSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    // PlantId dari JWT scope
    const plantId = ctx.user.plantIds[0];
    if (!plantId) {
      return NextResponse.json(
        { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope aktif." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    const result = await startShift({
      ...parsed.data,
      plantId,
      createdBy: ctx.user.userId,
    });

    return NextResponse.json(
      {
        shiftId: result.shift.id,
        status: "RUNNING",
        reportDate: result.shift.reportDate,
        actualStart: result.shift.actualStart,
        claimedHandoff: result.claimedHandoff
          ? {
              handoffId: result.claimedHandoff.id,
              sisaTsgKg: result.claimedHandoff.sisaTsgKg,
              batanganSementaraKg: result.claimedHandoff.batanganSementaraKg,
            }
          : null,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    console.error("Start shift error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan internal." }, requestId: ctx.requestId },
      { status: 500 }
    );
  }
},
  { requiredPermission: "shift.start" });
