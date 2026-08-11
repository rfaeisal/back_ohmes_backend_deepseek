// GET /api/v1/regions
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { region } from "@/db/schema";

export const GET = withAuth(async () => {
  const items = await db.select().from(region).limit(100);
  return NextResponse.json({ data: items }, { status: 200 });
});
