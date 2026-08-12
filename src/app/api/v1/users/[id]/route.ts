// PATCH + DELETE /api/v1/users/:id — Update & soft-delete user
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { user } from "@/db/schema";

const patchSchema = z.object({ username: z.string().optional(), isActive: z.boolean().optional(), fullName: z.string().optional(), email: z.string().optional() });

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid." }, requestId: ctx.requestId }, { status: 400 });

      await db.update(user).set(parsed.data).where(eq(user.id, id));
      return NextResponse.json({ success: true }, { status: 200 });
    } catch (e: any) {
      return NextResponse.json({ error: { code: "UPDATE_FAILED", message: e.message } }, { status: 400 });
    }
  }
);

export const DELETE = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      await db.update(user).set({ deletedAt: new Date(), isActive: false }).where(eq(user.id, id));
      return NextResponse.json({ success: true }, { status: 200 });
    } catch (e: any) {
      return NextResponse.json({ error: { code: "DELETE_FAILED", message: e.message } }, { status: 400 });
    }
  }
);
