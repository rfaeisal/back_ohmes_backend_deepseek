// DELETE /api/v1/user-assignments/:id — Revoke assignment
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { userAssignment } from "@/db/schema";

export const DELETE = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      await db.update(userAssignment).set({ revokedAt: new Date() }).where(eq(userAssignment.id, id));
      return NextResponse.json({ success: true }, { status: 200 });
    } catch (e: any) {
      return NextResponse.json({ error: { code: "REVOKE_FAILED", message: e.message } }, { status: 400 });
    }
  },
  { requiredPermission: "user.revoke_scope" }
);
