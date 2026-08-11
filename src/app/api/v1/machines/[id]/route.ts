// DELETE /api/v1/machines/:id — soft delete
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/middleware";
import db from "@/db";
import { machine } from "@/db/schema";

export const DELETE = withAuth(async (_req: Request, _ctx: any, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await db.update(machine).set({ deletedAt: new Date(), isActive: false }).where(eq(machine.id, id));
  return NextResponse.json({ success: true }, { status: 200 });
});
