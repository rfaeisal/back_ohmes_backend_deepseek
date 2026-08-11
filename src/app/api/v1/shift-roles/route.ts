// GET /api/v1/shift-roles
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftRole } from "@/db/schema";

export const GET = withAuth(async () => {
  const items = await db.select().from(shiftRole).limit(50);
  return NextResponse.json({ data: items }, { status: 200 });
});
