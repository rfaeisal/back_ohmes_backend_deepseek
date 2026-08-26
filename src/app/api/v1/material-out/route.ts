// GET + POST /api/v1/material-out — Keluar material/sparepart (transfer/retur/pemakaian)
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { materialOut, consumableOutItem, sparepartOutItem } from "@/db/schema";
import { consumableItem, sparepart } from "@/db/schema/master-product";
import { createMaterialOut, ServiceError } from "@/lib/services/material.service";

// GET — daftar material keluar; filter opsional machineId + outType
// (dipakai panel "Bahan di mesin ini" di halaman HLP)
export const GET = withAuth(async (request: Request) => {
  const url = new URL(request.url);
  const machineId = url.searchParams.get("machineId");
  const outType = url.searchParams.get("outType");

  const conditions = [];
  if (machineId) conditions.push(eq(materialOut.machineId, machineId));
  if (outType) conditions.push(eq(materialOut.outType, outType as "TRANSFER" | "RETUR" | "PEMAKAIAN"));

  const headers = await db
    .select()
    .from(materialOut)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(materialOut.outAt)
    .limit(100);

  const result = [];
  for (const h of headers) {
    const items =
      h.materialType === "CONSUMABLE"
        ? await db
            .select({
              name: consumableItem.name,
              unit: consumableItem.unit,
              quantity: consumableOutItem.quantity,
            })
            .from(consumableOutItem)
            .innerJoin(consumableItem, eq(consumableOutItem.consumableItemId, consumableItem.id))
            .where(eq(consumableOutItem.outId, h.id))
        : await db
            .select({
              name: sparepart.name,
              unit: sparepart.unit,
              quantity: sparepartOutItem.quantity,
            })
            .from(sparepartOutItem)
            .innerJoin(sparepart, eq(sparepartOutItem.sparepartId, sparepart.id))
            .where(eq(sparepartOutItem.outId, h.id));

    result.push({
      id: h.id,
      outCode: h.outCode,
      materialType: h.materialType,
      outType: h.outType,
      counterpartName: h.counterpartName,
      machineId: h.machineId,
      reason: h.reason,
      outAt: h.outAt,
      items: items.map((i) => ({ name: i.name, unit: i.unit, quantity: Number(i.quantity) })),
    });
  }

  return NextResponse.json({ data: result }, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });

const outSchema = z.object({
  materialType: z.enum(["CONSUMABLE", "SPAREPART"]),
  outType: z.enum(["TRANSFER", "RETUR", "PEMAKAIAN"]),
  // counterpartName wajib untuk TRANSFER/RETUR; PEMAKAIAN diisi otomatis dari kode mesin
  counterpartName: z.string().optional().default(""),
  machineId: z.string().uuid().optional(),
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
