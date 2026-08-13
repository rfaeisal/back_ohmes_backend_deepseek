// GET /api/v1/shift-templates
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftTemplate } from "@/db/schema";

import { z } from "zod";

const tmplSchema = z.object({ plantId: z.string().uuid(), code: z.string().min(1), name: z.string().min(1), startTime: z.string().min(1), durationMinutes: z.number().int().min(60).max(1440) });

export const GET = withAuth(async () => {
  const items = await db.select().from(shiftTemplate).limit(50);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request) => {
  const body = await request.json();
  const parsed = tmplSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const [item] = await db.insert(shiftTemplate).values({ ...parsed.data, isActive: true, displayOrder: 0 }).returning();
  return NextResponse.json(item, { status: 201 });
},
  { requiredPermission: "masterdata.shift-template.edit" });
