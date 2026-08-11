// DELETE /api/v1/plants/:id — soft delete
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { plant } from "@/db/schema";

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(plant).set({ deletedAt: new Date() }).where(eq(plant.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
});
