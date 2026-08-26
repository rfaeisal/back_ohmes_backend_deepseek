// GET + POST /api/v1/consumable-items — List & create consumable items
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { consumableItem } from "@/db/schema/master-product";

const createSchema = z.object({
  code: z.string().min(1, "Kode wajib"),
  name: z.string().min(1, "Nama wajib"),
  unit: z.string().min(1, "Unit wajib").default("roll"),
  productId: z.string().uuid().optional(),
  allowAtEndShift: z.boolean().optional().default(false),
  applicableMachines: z.enum(["MAKER", "HLP", "BOTH"]).optional().default("BOTH"),
});

// GET — reference data untuk dialog pemakaian (auth-only)
export const GET = withAuth(async (_req: Request, _ctx: AuthContext) => {
  const items = await db
    .select({
      id: consumableItem.id,
      code: consumableItem.code,
      name: consumableItem.name,
      unit: consumableItem.unit,
      productId: consumableItem.productId,
      allowAtEndShift: consumableItem.allowAtEndShift,
      applicableMachines: consumableItem.applicableMachines,
    })
    .from(consumableItem)
    .orderBy(consumableItem.code);

  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
      { status: 400 }
    );
  }

  const [item] = await db
    .insert(consumableItem)
    .values({
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      productId: parsed.data.productId ?? null,
      allowAtEndShift: parsed.data.allowAtEndShift ?? false,
    })
    .returning();

  return NextResponse.json(item, { status: 201 });
}, { requiredPermission: "masterdata.consumable.edit" });
