// GET + POST /api/v1/users — List & create users
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { user } from "@/db/schema";
import { hashPassword } from "@/lib/auth";

const createSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  fullName: z.string().min(1),
  email: z.string().email().optional(),
});

export const GET = withAuth(async (_req: Request, _ctx: AuthContext) => {
  const users = await db.select({
    id: user.id, username: user.username, fullName: user.fullName,
    email: user.email, isActive: user.isActive, createdAt: user.createdAt,
  }).from(user).orderBy(user.createdAt).limit(100);
  return NextResponse.json({ data: users }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      const fieldMsgs = Object.entries(fields).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`).join("; ");
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: fieldMsgs || "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const [newUser] = await db.insert(user).values({
      username: parsed.data.username,
      passwordHash,
      fullName: parsed.data.fullName,
      email: parsed.data.email ?? null,
    }).returning({ id: user.id, username: user.username, fullName: user.fullName });

    return NextResponse.json(newUser, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "CREATE_FAILED", message: e.message }, requestId: ctx.requestId }, { status: 400 });
  }
});
