// POST + GET /api/v1/material-receiving — Terima & lihat material/sparepart
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import {
  createMaterialReceiving,
  listMaterialReceiving,
  type MaterialType,
  ServiceError,
} from "@/lib/services/material.service";

const receivingSchema = z.object({
  supplierId: z.string().uuid(),
  materialType: z.enum(["CONSUMABLE", "SPAREPART"]),
  supplierDocRef: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().min(0.01, "Quantity harus > 0"),
      })
    )
    .min(1, "Minimal 1 item"),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = receivingSchema.safeParse(body);

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

    const result = await createMaterialReceiving({
      plantId,
      supplierId: parsed.data.supplierId,
      materialType: parsed.data.materialType,
      receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
      receivedBy: ctx.user.userId,
      supplierDocRef: parsed.data.supplierDocRef,
      notes: parsed.data.notes,
      items: parsed.data.items,
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
}, { requiredPermission: "tsg.receiving.create" });

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const materialType = url.searchParams.get("materialType") as MaterialType | null;

  const result = await listMaterialReceiving({
    plantId: ctx.user.plantIds[0] ?? undefined,
    from,
    to,
    materialType: materialType ?? undefined,
  });

  return NextResponse.json(result, { status: 200 });
}, { requiredPermission: "tsg.receiving.view" });