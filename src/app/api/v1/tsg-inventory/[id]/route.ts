// PATCH /api/v1/tsg-inventory/:id — Update inventory (location, etc)
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { tsgInventory } from "@/db/schema";

const patchSchema = z.object({ locationCode: z.string().optional() });

export const PATCH = withAuth(async (request: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid." } }, { status: 400 });
  await db.update(tsgInventory).set({ locationCode: parsed.data.locationCode ?? null }).where(eq(tsgInventory.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
});
