// POST + GET /api/v1/tsg-returns — Retur TSG ke supplier
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createTsgReturn, listTsgReturns } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

const returnSchema = z.object({
  supplierId: z.string().uuid(),
  inventoryBoxIds: z.array(z.string().uuid()).min(1, "Pilih minimal 1 boks"),
  reason: z.string().min(3, "Alasan retur wajib (min 3 karakter)"),
  notes: z.string().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = returnSchema.safeParse(body);
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

    const result = await createTsgReturn({
      plantId,
      supplierId: parsed.data.supplierId,
      inventoryBoxIds: parsed.data.inventoryBoxIds,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      returnedBy: ctx.user.userId,
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
  const result = await listTsgReturns(plantId);
  return NextResponse.json(result, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });
