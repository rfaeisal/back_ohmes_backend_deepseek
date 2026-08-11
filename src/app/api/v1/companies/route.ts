// GET /api/v1/companies
import { NextResponse } from "next/server";
import { isNull } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { company } from "@/db/schema";

export const GET = withAuth(async () => {
  const items = await db.select().from(company).where(isNull(company.deletedAt)).limit(10);
  return NextResponse.json({ data: items }, { status: 200 });
});
