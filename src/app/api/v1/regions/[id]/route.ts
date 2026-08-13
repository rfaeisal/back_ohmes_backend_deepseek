// PATCH + DELETE /api/v1/regions/:id
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { region } from "@/db/schema";

const patchSchema = z.object({ code: z.string().optional(), name: z.string().optional() });

export const PATCH = withAuth(async (request: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  await db.update(region).set(parsed.data).where(eq(region.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.plant.edit" });

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(region).set({ deletedAt: new Date() }).where(eq(region.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.plant.edit" });
