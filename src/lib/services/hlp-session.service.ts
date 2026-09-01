// =============================================================================
// HLP Session Service — sesi HLP open-ended (docs/23)
// =============================================================================
// Sesi HLP = entitas kehadiran kontinu: tidak terbatas 8 jam, ganti anggota
// tanpa menutup sesi, tanpa approval. Perolehan pack tetap milik batch —
// sesi hanya dimensi akuntabilitas (siapa bertugas kapan).
// =============================================================================

import { eq, and, isNull, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import db from "@/db";
import { hlpShift, hlpShiftMember } from "@/db/schema";
import { hlpPack } from "@/db/schema/box";
import { machine } from "@/db/schema/master-product";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export interface OpenHlpShiftInput {
  plantId: string;
  hlpMachineId: string;
  startedBy: string;
  /** Anggota awal (opsional) — roster hanya default value, bebas pilih */
  members?: Array<{ userId: string; shiftRoleId?: string }>;
}

// =============================================================================
// Open / Close
// =============================================================================

export async function openHlpShift(input: OpenHlpShiftInput) {
  // Validasi mesin HLP
  const [m] = await db
    .select({ id: machine.id, type: machine.type, code: machine.code })
    .from(machine)
    .where(and(eq(machine.id, input.hlpMachineId), isNull(machine.deletedAt)))
    .limit(1);
  if (!m) throw new ServiceError("MACHINE_NOT_FOUND", "Mesin tidak ditemukan.");
  if (m.type !== "HLP") {
    throw new ServiceError("NOT_HLP_MACHINE", `Mesin ${m.code} bukan mesin HLP.`);
  }

  // Satu sesi OPEN per mesin (unique index sebagai backstop)
  const [existingOpen] = await db
    .select({ id: hlpShift.id })
    .from(hlpShift)
    .where(
      and(
        eq(hlpShift.hlpMachineId, input.hlpMachineId),
        eq(hlpShift.status, "OPEN"),
        isNull(hlpShift.deletedAt)
      )
    )
    .limit(1);
  if (existingOpen) {
    throw new ServiceError(
      "HLP_SHIFT_ALREADY_OPEN",
      `Mesin ${m.code} masih punya sesi terbuka. Tutup sesi lama dulu.`,
      { openShiftId: existingOpen.id }
    );
  }

  const [shift] = await db
    .insert(hlpShift)
    .values({
      plantId: input.plantId,
      hlpMachineId: input.hlpMachineId,
      startedBy: input.startedBy,
      status: "OPEN",
    })
    .returning();
  if (!shift) throw new ServiceError("HLP_SHIFT_CREATE_FAILED", "Gagal membuka sesi HLP.");

  for (const mem of input.members ?? []) {
    await db.insert(hlpShiftMember).values({
      hlpShiftId: shift.id,
      userId: mem.userId,
      shiftRoleId: mem.shiftRoleId ?? null,
    });
  }

  await writeAudit({
    actorUserId: input.startedBy,
    action: "hlp.shift.open",
    entityTable: "hlp_shift",
    entityId: shift.id,
    after: { hlpMachineId: input.hlpMachineId, memberCount: input.members?.length ?? 0 },
  });

  return {
    hlpShiftId: shift.id,
    hlpMachineId: shift.hlpMachineId,
    status: shift.status,
    startedAt: shift.startedAt,
  };
}

export async function closeHlpShift(shiftId: string, endedBy: string) {
  const [shift] = await db
    .select()
    .from(hlpShift)
    .where(and(eq(hlpShift.id, shiftId), isNull(hlpShift.deletedAt)))
    .limit(1);
  if (!shift) throw new ServiceError("HLP_SHIFT_NOT_FOUND", "Sesi HLP tidak ditemukan.");
  if (shift.status !== "OPEN") {
    throw new ServiceError("HLP_SHIFT_NOT_OPEN", "Sesi HLP sudah ditutup.");
  }

  const [updated] = await db
    .update(hlpShift)
    .set({ status: "CLOSED", endedBy, endedAt: new Date() })
    .where(eq(hlpShift.id, shiftId))
    .returning();

  // Anggota yang masih aktif otomatis lepas saat sesi ditutup
  await db
    .update(hlpShiftMember)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(hlpShiftMember.hlpShiftId, shiftId),
        isNull(hlpShiftMember.leftAt)
      )
    );

  await writeAudit({
    actorUserId: endedBy,
    action: "hlp.shift.close",
    entityTable: "hlp_shift",
    entityId: shiftId,
    before: { status: "OPEN" },
    after: { status: "CLOSED" },
  });

  return { hlpShiftId: shiftId, status: "CLOSED", endedAt: updated!.endedAt };
}

// =============================================================================
// Members — attach/detach tanpa menutup sesi
// =============================================================================

export async function attachHlpShiftMember(
  shiftId: string,
  userId: string,
  shiftRoleId?: string,
  actorUserId?: string
) {
  const [shift] = await db
    .select({ id: hlpShift.id, status: hlpShift.status })
    .from(hlpShift)
    .where(and(eq(hlpShift.id, shiftId), isNull(hlpShift.deletedAt)))
    .limit(1);
  if (!shift) throw new ServiceError("HLP_SHIFT_NOT_FOUND", "Sesi HLP tidak ditemukan.");
  if (shift.status !== "OPEN") {
    throw new ServiceError("HLP_SHIFT_NOT_OPEN", "Sesi HLP sudah ditutup — tidak bisa ubah anggota.");
  }

  // User tidak boleh dobel aktif di sesi yang sama
  const [active] = await db
    .select({ id: hlpShiftMember.id })
    .from(hlpShiftMember)
    .where(
      and(
        eq(hlpShiftMember.hlpShiftId, shiftId),
        eq(hlpShiftMember.userId, userId),
        isNull(hlpShiftMember.leftAt)
      )
    )
    .limit(1);
  if (active) {
    throw new ServiceError("HLP_MEMBER_ALREADY_ACTIVE", "User ini sudah aktif di sesi tersebut.");
  }

  const [member] = await db
    .insert(hlpShiftMember)
    .values({ hlpShiftId: shiftId, userId, shiftRoleId: shiftRoleId ?? null })
    .returning();
  if (!member) throw new ServiceError("HLP_MEMBER_ADD_FAILED", "Gagal menambah anggota sesi.");

  await writeAudit({
    actorUserId: actorUserId ?? userId,
    action: "hlp.shift.member.join",
    entityTable: "hlp_shift_member",
    entityId: member.id,
    after: { hlpShiftId: shiftId, userId, shiftRoleId: shiftRoleId ?? null },
  });

  return member;
}

export async function leaveHlpShiftMember(memberId: string, actorUserId?: string) {
  const [member] = await db
    .select()
    .from(hlpShiftMember)
    .where(eq(hlpShiftMember.id, memberId))
    .limit(1);
  if (!member) throw new ServiceError("HLP_MEMBER_NOT_FOUND", "Anggota sesi tidak ditemukan.");
  if (member.leftAt != null) {
    throw new ServiceError("HLP_MEMBER_ALREADY_LEFT", "Anggota ini sudah lepas dari sesi.");
  }

  const [updated] = await db
    .update(hlpShiftMember)
    .set({ leftAt: new Date() })
    .where(eq(hlpShiftMember.id, memberId))
    .returning();

  await writeAudit({
    actorUserId: actorUserId ?? member.userId,
    action: "hlp.shift.member.leave",
    entityTable: "hlp_shift_member",
    entityId: memberId,
    before: { leftAt: null },
    after: { leftAt: updated!.leftAt },
  });

  return updated;
}

// =============================================================================
// List & Detail
// =============================================================================

export async function listHlpShifts(params: { plantId?: string; status?: string; machineId?: string; limit?: number }) {
  const rows = await db
    .select({
      id: hlpShift.id,
      plantId: hlpShift.plantId,
      hlpMachineId: hlpShift.hlpMachineId,
      machineCode: machine.code,
      machineName: machine.name,
      startedBy: hlpShift.startedBy,
      startedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${hlpShift.startedBy})`.mapWith(String),
      startedAt: hlpShift.startedAt,
      endedAt: hlpShift.endedAt,
      status: hlpShift.status,
      activeMemberCount: sql<number>`(SELECT COUNT(*)::int FROM hlp_shift_member hsm
        WHERE hsm.hlp_shift_id = ${hlpShift.id} AND hsm.left_at IS NULL)`.mapWith(Number),
    })
    .from(hlpShift)
    .leftJoin(machine, eq(hlpShift.hlpMachineId, machine.id))
    .where(
      and(
        ...(params.plantId ? [eq(hlpShift.plantId, params.plantId)] : []),
        ...(params.status ? [eq(hlpShift.status, params.status)] : []),
        ...(params.machineId ? [eq(hlpShift.hlpMachineId, params.machineId)] : []),
        isNull(hlpShift.deletedAt)
      )
    )
    .orderBy(desc(hlpShift.startedAt))
    .limit(params.limit ?? 50);

  return rows;
}

export async function getHlpShiftDetail(shiftId: string) {
  const [shift] = await db
    .select({
      id: hlpShift.id,
      plantId: hlpShift.plantId,
      hlpMachineId: hlpShift.hlpMachineId,
      machineCode: machine.code,
      machineName: machine.name,
      startedBy: hlpShift.startedBy,
      startedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${hlpShift.startedBy})`.mapWith(String),
      startedAt: hlpShift.startedAt,
      endedBy: hlpShift.endedBy,
      endedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${hlpShift.endedBy})`.mapWith(String),
      endedAt: hlpShift.endedAt,
      status: hlpShift.status,
    })
    .from(hlpShift)
    .leftJoin(machine, eq(hlpShift.hlpMachineId, machine.id))
    .where(and(eq(hlpShift.id, shiftId), isNull(hlpShift.deletedAt)))
    .limit(1);
  if (!shift) return null;

  const members = await db
    .select({
      id: hlpShiftMember.id,
      userId: hlpShiftMember.userId,
      userName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${hlpShiftMember.userId})`.mapWith(String),
      shiftRoleId: hlpShiftMember.shiftRoleId,
      roleName: sql<string>`(SELECT sr.name FROM shift_role sr WHERE sr.id = ${hlpShiftMember.shiftRoleId})`.mapWith(String),
      joinedAt: hlpShiftMember.joinedAt,
      leftAt: hlpShiftMember.leftAt,
    })
    .from(hlpShiftMember)
    .where(eq(hlpShiftMember.hlpShiftId, shiftId))
    .orderBy(hlpShiftMember.joinedAt);

  const packings = await db
    .select({
      id: hlpPack.id,
      batchCode: sql<string>`(SELECT b.code FROM batch b WHERE b.id = ${hlpPack.batchId})`.mapWith(String),
      packsLolos: hlpPack.packsLolos,
      rejectPacks: hlpPack.rejectPacks,
      rejectBatangan: hlpPack.rejectBatangan,
      packedAt: hlpPack.packedAt,
    })
    .from(hlpPack)
    .where(eq(hlpPack.hlpShiftId, shiftId))
    .orderBy(hlpPack.packedAt);

  return { ...shift, members, packings };
}
