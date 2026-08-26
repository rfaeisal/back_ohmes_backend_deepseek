// POST /api/v1/qr/generate — Generate QR code
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateQr, ServiceError } from "@/lib/services/qr.service";

const schema = z.object({
  type: z.enum(["MACHINE", "TSG_BOX", "BATCH", "PACK"]),
  entityId: z.string().uuid(),
  // Opsional — request tim mobile (26 Agu): user dengan banyak plant
  // butuh generate QR untuk plant non-default. Wajib dalam scope user.
  plantId: z.string().uuid().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    // plantId eksplisit opsional — harus ada di scope user (kecuali SUPERADMIN).
    // Default tetap plantIds[0] supaya client lama tidak berubah perilakunya.
    const requestedPlant = parsed.data.plantId;
    const inScope = requestedPlant
      ? ctx.user.isPrivileged || ctx.user.plantIds.includes(requestedPlant)
      : true;
    if (!inScope) {
      return NextResponse.json(
        { error: { code: "PLANT_OUT_OF_SCOPE", message: "Plant di luar scope aktif." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }
    const plantId = requestedPlant ?? ctx.user.plantIds[0];
    if (!plantId) {
      return NextResponse.json(
        { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    const result = await generateQr({ ...parsed.data, plantId, generatedBy: ctx.user.userId });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    throw err;
  }
});
