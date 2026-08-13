// PATCH + DELETE /api/v1/plants/:id
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { plant } from "@/db/schema";

const patchSchema = z.object({ name: z.string().optional(), address: z.string().optional(), code: z.string().optional(), deletedAt: z.string().nullable().optional() });

export const PATCH = withAuth(async (request: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid." } }, { status: 400 });
  const update: any = { ...parsed.data };
  if (update.deletedAt === null) update.deletedAt = null; // Reactivate
  else if (update.deletedAt) update.deletedAt = new Date(update.deletedAt);
  delete update.deletedAt;
  // Handle deletedAt specially
  if (parsed.data.deletedAt === null) {
    await db.update(plant).set({ ...update, deletedAt: null }).where(eq(plant.id, id));
  } else {
    await db.update(plant).set(update).where(eq(plant.id, id));
  }
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.plant.edit" });

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(plant).set({ deletedAt: new Date() }).where(eq(plant.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.plant.edit" });
