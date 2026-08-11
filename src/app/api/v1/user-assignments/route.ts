// GET + POST /api/v1/user-assignments
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { userAssignment, role } from "@/db/schema";

const assignSchema = z.object({
  userId: z.string().uuid(),
  scopeType: z.string().min(1),
  scopeId: z.string().uuid(),
  roleCode: z.string().min(1),
});

export const GET = withAuth(async (_req: Request, _ctx: AuthContext) => {
  const items = await db.select({
    id: userAssignment.id, userId: userAssignment.userId,
    scopeType: userAssignment.scopeType, scopeId: userAssignment.scopeId,
    roleId: userAssignment.roleId, roleCode: role.code,
    assignedAt: userAssignment.assignedAt,
  }).from(userAssignment).innerJoin(role, eq(userAssignment.roleId, role.id))
    .where(isNull(userAssignment.revokedAt)).limit(500);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      const fieldMsgs = Object.entries(fields).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`).join("; ");
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: fieldMsgs || "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });
    }

    const [roleRecord] = await db.select({ id: role.id }).from(role).where(eq(role.code, parsed.data.roleCode)).limit(1);
    if (!roleRecord) return NextResponse.json({ error: { code: "ROLE_NOT_FOUND", message: "Role tidak ditemukan." }, requestId: ctx.requestId }, { status: 400 });

    await db.insert(userAssignment).values({
      userId: parsed.data.userId,
      scopeType: parsed.data.scopeType,
      scopeId: parsed.data.scopeId,
      roleId: roleRecord.id,
      assignedBy: ctx.user.userId,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "ASSIGN_FAILED", message: e.message }, requestId: ctx.requestId }, { status: 400 });
  }
});
