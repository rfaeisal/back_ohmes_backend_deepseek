// GET /api/v1/consumable-items — List consumable items (reference data)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { consumableItem } from "@/db/schema/master-product";

export const GET = withAuth(async (_req: Request, _ctx: AuthContext) => {
  const items = await db
    .select({
      id: consumableItem.id,
      code: consumableItem.code,
      name: consumableItem.name,
      unit: consumableItem.unit,
      productId: consumableItem.productId,
    })
    .from(consumableItem)
    .orderBy(consumableItem.code);

  return NextResponse.json({ data: items }, { status: 200 });
});
