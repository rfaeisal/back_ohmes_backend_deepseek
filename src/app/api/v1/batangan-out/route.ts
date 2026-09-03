// GET + POST /api/v1/batangan-out — batangan keluar sebagai produk final
// (docs/26 §6). Batch makloon mewarisi order + customer otomatis.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { ServiceError } from "@/lib/services/shift.service";
import { createBatanganOut, listBatanganOuts } from "@/lib/services/batangan-out.service";

export const GET = withAuth(async (_request: Request, ctx: AuthContext) => {
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }
  const data = await listBatanganOuts(plantId);
  return NextResponse.json({ data }, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });

const createSchema = z.object({
  batchId: z.string().uuid(),
  qtyKg: z.number().positive().max(10000),
  batangEst: z.number().int().min(0).optional(),
  destinationType: z.enum(["INTERNAL", "MAKLOON", "LAIN"]).default("INTERNAL"),
  destinationName: z.string().max(120).optional(),
  docRef: z.string().max(50).optional(),
  notes: z.string().max(200).optional(),
});

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

    const result = await createBatanganOut({
      plantId,
      batchId: parsed.data.batchId,
      qtyKg: parsed.data.qtyKg,
      batangEst: parsed.data.batangEst,
      destinationType: parsed.data.destinationType,
      destinationName: parsed.data.destinationName,
      docRef: parsed.data.docRef,
      notes: parsed.data.notes,
      actorUserId: ctx.user.userId,
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
}, { requiredPermission: "tsg.inventory.transfer" });
