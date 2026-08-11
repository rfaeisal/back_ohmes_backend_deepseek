// PATCH /shifts/:id/members — Add/remove/update anggota tim
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftMember, shiftReport } from "@/db/schema";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  add: z.array(z.object({ userId: z.string().uuid(), shiftRoleId: z.string().uuid() })).optional(),
  remove: z.array(z.string().uuid()).optional(),
  updateLeave: z.array(z.object({ userId: z.string().uuid(), leaveMinutes: z.number().int().min(0), note: z.string().optional() })).optional(),
});

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftReportId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });

      const [shift] = await db.select({ status: shiftReport.status }).from(shiftReport).where(eq(shiftReport.id, shiftReportId)).limit(1);
      if (!shift || shift.status !== "RUNNING") return NextResponse.json({ error: { code: "SHIFT_NOT_RUNNING", message: "Hanya shift RUNNING yang bisa ubah anggota." }, requestId: ctx.requestId }, { status: 409 });

      if (parsed.data.add) for (const m of parsed.data.add) await db.insert(shiftMember).values({ shiftReportId, userId: m.userId, shiftRoleId: m.shiftRoleId }).onConflictDoNothing();
      if (parsed.data.remove) for (const userId of parsed.data.remove) await db.delete(shiftMember).where(and(eq(shiftMember.shiftReportId, shiftReportId), eq(shiftMember.userId, userId)));
      if (parsed.data.updateLeave) for (const u of parsed.data.updateLeave) await db.update(shiftMember).set({ leaveMinutes: u.leaveMinutes, note: u.note ?? null }).where(and(eq(shiftMember.shiftReportId, shiftReportId), eq(shiftMember.userId, u.userId)));

      return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      throw err;
    }
  }
);
