// GET + POST /api/v1/external-pack-outs — keluaran pack makloon ke customer
// docs/24 §3.3: per batch langsung (tanpa detail karton), pack + rijekan
// dikembalikan ke customer.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import {
  createExternalPackOut,
  listExternalPackOuts,
} from "@/lib/services/makloon.service";
import { ServiceError } from "@/lib/services/shift.service";

const createSchema = z.object({
  batchId: z.string().uuid(),
  destinationName: z.string().min(1, "Nama customer wajib"),
  docRef: z.string().max(50).optional(),
  packQty: z.number().int().min(0).default(0),
  rejectPackQty: z.number().int().min(0).default(0),
  rejectBatangQty: z.number().int().min(0).default(0),
  // Stage saat keluar (docs/25 §4) — default ikut entry stage batch
  exitStage: z.enum(["PACK", "PACK_WRAPPED", "SLOP", "BAL"]).optional(),
});

export const GET = withAuth(async (_request: Request, ctx: AuthContext) => {
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }
  const data = await listExternalPackOuts(plantId);
  return NextResponse.json({ data }, { status: 200 });
}, { requiredPermission: "cartoning.view" });

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
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
    const result = await createExternalPackOut({
      plantId,
      batchId: parsed.data.batchId,
      destinationName: parsed.data.destinationName,
      docRef: parsed.data.docRef,
      packQty: parsed.data.packQty,
      rejectPackQty: parsed.data.rejectPackQty,
      rejectBatangQty: parsed.data.rejectBatangQty,
      exitStage: parsed.data.exitStage,
      outBy: ctx.user.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
}, { requiredPermission: "cartoning.create" });
