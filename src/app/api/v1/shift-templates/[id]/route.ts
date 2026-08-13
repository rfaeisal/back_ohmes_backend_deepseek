// PATCH + DELETE /api/v1/shift-templates/:id
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftTemplate } from "@/db/schema";

const patchSchema = z.object({ code: z.string().optional(), name: z.string().optional(), startTime: z.string().optional(), durationMinutes: z.number().int().optional(), isActive: z.boolean().optional() });

export const PATCH = withAuth(async (request: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  await db.update(shiftTemplate).set(parsed.data).where(eq(shiftTemplate.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.shift-template.edit" });

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(shiftTemplate).set({ isActive: false }).where(eq(shiftTemplate.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
},
  { requiredPermission: "masterdata.shift-template.edit" });
