// GET /api/v1/shift-templates
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftTemplate } from "@/db/schema";

export const GET = withAuth(async () => {
  const items = await db.select().from(shiftTemplate).limit(50);
  return NextResponse.json({ data: items }, { status: 200 });
});
