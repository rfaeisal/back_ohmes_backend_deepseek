// GET + POST /api/v1/machines/:id/downtime — Riwayat downtime level mesin
// (backlog #2: TIDAK terikat shift — pelengkap downtime_log yang shift-bound)
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { machineDowntime, machine } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  reason: z.string().min(3, "Alasan wajib (min 3 karakter)"),
});

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const items = await db
      .select()
      .from(machineDowntime)
      .where(eq(machineDowntime.machineId, id))
      .orderBy(desc(machineDowntime.startedAt))
      .limit(50);

    return NextResponse.json({ data: items }, { status: 200 });
  },
  { requiredPermission: "shift.view" }
);

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const started = new Date(parsed.data.startedAt);
    const ended = new Date(parsed.data.endedAt);
    if (ended <= started) {
      return NextResponse.json(
        { error: { code: "INVALID_TIME_RANGE", message: "Waktu selesai harus setelah waktu mulai." }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const [m] = await db.select({ id: machine.id, plantId: machine.plantId }).from(machine).where(eq(machine.id, id)).limit(1);
    if (!m) {
      return NextResponse.json({ error: { code: "MACHINE_NOT_FOUND", message: "Mesin tidak ditemukan." }, requestId: ctx.requestId }, { status: 404 });
    }

    const [row] = await db
      .insert(machineDowntime)
      .values({
        plantId: m.plantId,
        machineId: id,
        startedAt: started,
        endedAt: ended,
        reason: parsed.data.reason,
        loggedBy: ctx.user.userId,
      })
      .returning();

    await writeAudit({
      actorUserId: ctx.user.userId,
      action: "machine.downtime.log",
      entityTable: "machine_downtime",
      entityId: row!.id,
      after: { machineId: id, startedAt: parsed.data.startedAt, endedAt: parsed.data.endedAt, reason: parsed.data.reason },
      isPrivileged: ctx.user.isPrivileged,
    });

    return NextResponse.json(row, { status: 201 });
  },
  { requiredPermission: "shift.downtime.log" }
);
