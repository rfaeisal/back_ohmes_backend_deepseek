// PATCH /api/v1/auth/change-password — User ganti password sendiri
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { user } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";

const schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const PATCH = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid." }, requestId: ctx.requestId }, { status: 400 });

    const [u] = await db.select({ passwordHash: user.passwordHash }).from(user).where(eq(user.id, ctx.user.userId)).limit(1);
    if (!u) return NextResponse.json({ error: { code: "USER_NOT_FOUND" } }, { status: 404 });

    const valid = await verifyPassword(parsed.data.oldPassword, u.passwordHash);
    if (!valid) return NextResponse.json({ error: { code: "INVALID_PASSWORD", message: "Password lama salah." } }, { status: 400 });

    const newHash = await hashPassword(parsed.data.newPassword);
    await db.update(user).set({ passwordHash: newHash }).where(eq(user.id, ctx.user.userId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "CHANGE_FAILED", message: e.message } }, { status: 400 });
  }
});
