// GET /api/v1/shift-templates
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftTemplate } from "@/db/schema";

export const GET = withAuth(async () => {
  const items = await db.select().from(shiftTemplate).where(eq(shiftTemplate.isActive, true)).limit(50);
  return NextResponse.json({ data: items }, { status: 200 });
});
