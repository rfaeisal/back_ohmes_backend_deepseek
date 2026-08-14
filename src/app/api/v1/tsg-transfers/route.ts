// POST + GET /api/v1/tsg-transfers — Kirim TSG ke pabrik lain (eksternal)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createTsgTransfer, listTsgTransfers } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

const transferSchema = z.object({
  destinationName: z.string().min(1, "Nama pabrik tujuan wajib"),
  inventoryBoxIds: z.array(z.string().uuid()).min(1, "Pilih minimal 1 boks"),
  notes: z.string().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = transferSchema.safeParse(body);
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

    const result = await createTsgTransfer({
      plantId,
      destinationName: parsed.data.destinationName,
      inventoryBoxIds: parsed.data.inventoryBoxIds,
      notes: parsed.data.notes,
      sentBy: ctx.user.userId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
}, { requiredPermission: "tsg.inventory.transfer" });

export const GET = withAuth(async (_request: Request, ctx: AuthContext) => {
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }
  const result = await listTsgTransfers(plantId);
  return NextResponse.json(result, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });
