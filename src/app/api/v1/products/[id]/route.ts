// DELETE /api/v1/products/:id — soft delete
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { product } from "@/db/schema";

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(product).set({ deletedAt: new Date(), isActive: false }).where(eq(product.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
});
