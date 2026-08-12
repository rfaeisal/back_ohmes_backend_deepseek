// GET /api/v1/regions
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { region } from "@/db/schema";

import { z } from "zod";

const regionSchema = z.object({ companyId: z.string().uuid(), code: z.string().min(1), name: z.string().min(1) });

export const GET = withAuth(async () => {
  const items = await db.select().from(region).limit(100);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request) => {
  const body = await request.json();
  const parsed = regionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const [item] = await db.insert(region).values(parsed.data).returning();
  return NextResponse.json(item, { status: 201 });
});
