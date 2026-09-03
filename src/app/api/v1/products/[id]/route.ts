// PATCH + DELETE /api/v1/products/:id
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { product } from "@/db/schema";

const patchSchema = z.object({
  brand: z.string().optional(),
  variant: z.string().optional(),
  code: z.string().optional(),
  // 0033 — satu jenis TSG per produk + batang per pack standar
  tsgType: z.enum(["REGULER", "MILD", "PUTIHAN"]).optional(),
  batangPerPack: z.number().int().min(1).max(200).optional(),
});

export const PATCH = withAuth(async (request: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  await db.update(product).set(parsed.data).where(eq(product.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.product.edit" });

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(product).set({ deletedAt: new Date(), isActive: false }).where(eq(product.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.product.edit" });
