// GET + POST /api/v1/machines/:id/maintenance — Riwayat perbaikan/preventive mesin
// (backlog #2: catatan level mesin, TIDAK terikat shift)
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { machineMaintenance, machine } from "@/db/schema";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  maintenanceType: z.enum(["PERBAIKAN", "PREVENTIVE"]).default("PERBAIKAN"),
  description: z.string().min(3, "Deskripsi wajib (min 3 karakter)"),
  maintenanceAt: z.string().datetime({ offset: true }).optional(), // ISO; default now()
  notes: z.string().optional(),
});

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const items = await db
      .select()
      .from(machineMaintenance)
      .where(eq(machineMaintenance.machineId, id))
      .orderBy(desc(machineMaintenance.maintenanceAt))
      .limit(50);

    return NextResponse.json({ data: items }, { status: 200 });
  },
  { requiredPermission: "shift.maintenance.log" }
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

    // Mesin harus ada (dan validasi scope via RLS di INSERT)
    const [m] = await db.select({ id: machine.id, plantId: machine.plantId }).from(machine).where(eq(machine.id, id)).limit(1);
    if (!m) {
      return NextResponse.json({ error: { code: "MACHINE_NOT_FOUND", message: "Mesin tidak ditemukan." }, requestId: ctx.requestId }, { status: 404 });
    }

    const [row] = await db
      .insert(machineMaintenance)
      .values({
        plantId: m.plantId,
        machineId: id,
        maintenanceType: parsed.data.maintenanceType,
        description: parsed.data.description,
        maintenanceAt: parsed.data.maintenanceAt ? new Date(parsed.data.maintenanceAt) : new Date(),
        doneBy: ctx.user.userId,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    await writeAudit({
      actorUserId: ctx.user.userId,
      action: "machine.maintenance.log",
      entityTable: "machine_maintenance",
      entityId: row!.id,
      after: { machineId: id, maintenanceType: parsed.data.maintenanceType, description: parsed.data.description },
      isPrivileged: ctx.user.isPrivileged,
    });

    return NextResponse.json(row, { status: 201 });
  },
  { requiredPermission: "shift.maintenance.log" }
);
