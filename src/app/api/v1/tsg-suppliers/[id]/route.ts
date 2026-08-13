// PATCH + DELETE /api/v1/tsg-suppliers/:id
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { tsgSupplier } from "@/db/schema";

const patchSchema = z.object({ name: z.string().optional(), contactPerson: z.string().optional(), contactPhone: z.string().optional(), address: z.string().optional() });

export const PATCH = withAuth(async (request: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  await db.update(tsgSupplier).set(parsed.data).where(eq(tsgSupplier.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.tsg-supplier.edit" });

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(tsgSupplier).set({ deletedAt: new Date(), isActive: false }).where(eq(tsgSupplier.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.tsg-supplier.edit" });
