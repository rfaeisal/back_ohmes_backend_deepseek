// GET /api/v1/spareparts — List spareparts (reference data)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { sparepart } from "@/db/schema/master-product";

export const GET = withAuth(async (_req: Request, _ctx: AuthContext) => {
  const items = await db
    .select({
      id: sparepart.id,
      code: sparepart.code,
      name: sparepart.name,
      unit: sparepart.unit,
    })
    .from(sparepart)
    .orderBy(sparepart.code);

  return NextResponse.json({ data: items }, { status: 200 });
});
