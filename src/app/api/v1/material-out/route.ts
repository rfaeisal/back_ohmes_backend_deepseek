// POST /api/v1/material-out — Keluar material/sparepart (transfer/retur)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createMaterialOut, ServiceError } from "@/lib/services/material.service";

const outSchema = z.object({
  materialType: z.enum(["CONSUMABLE", "SPAREPART"]),
  outType: z.enum(["TRANSFER", "RETUR"]),
  counterpartName: z.string().min(1, "Tujuan/supplier wajib"),
  reason: z.string().min(3, "Alasan wajib (min 3 karakter)"),
  notes: z.string().optional(),
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.number().min(0.01) }))
    .min(1, "Minimal 1 item"),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = outSchema.safeParse(body);
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

    const result = await createMaterialOut({
      plantId,
      ...parsed.data,
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
}, { requiredPermission: "tsg.inventory.transfer" });
