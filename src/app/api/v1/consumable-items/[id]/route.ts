// PATCH + DELETE /api/v1/consumable-items/:id — Edit & delete consumable item
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { consumableItem } from "@/db/schema/master-product";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  productId: z.string().uuid().nullable().optional(),
  allowAtEndShift: z.boolean().optional(),
});

export const PATCH = withAuth(async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
      { status: 400 }
    );
  }

  const [item] = await db
    .update(consumableItem)
    .set(parsed.data)
    .where(eq(consumableItem.id, id))
    .returning();

  if (!item) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Item tidak ditemukan." }, requestId: ctx.requestId }, { status: 404 });
  }

  return NextResponse.json(item, { status: 200 });
}, { requiredPermission: "masterdata.consumable.edit" });

export const DELETE = withAuth(async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.delete(consumableItem).where(eq(consumableItem.id, id));
  return NextResponse.json({ ok: true }, { status: 200 });
}, { requiredPermission: "masterdata.consumable.edit" });