// GET + POST + DELETE /api/v1/plants
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { plant } from "@/db/schema";

export const GET = withAuth(async () => {
  const items = await db.select().from(plant).limit(100);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request) => {
  const body = await request.json();
  const schema = z.object({ regionId: z.string().uuid(), code: z.string().min(3), name: z.string().min(1), address: z.string().optional() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid." } }, { status: 400 });
  const [item] = await db.insert(plant).values({ ...parsed.data, timezone: "Asia/Jakarta" }).returning();
  return NextResponse.json(item, { status: 201 });
});
