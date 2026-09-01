// =============================================================================
// Chain Service — catatan per-stage rantai produksi (docs/25)
// =============================================================================
// HLP → WR (wrapping) → SLOP (+slop wrapping, 1 proses) → BAL (baling) →
// karton manual (pemakaian material saja). Tanpa sesi formal: 1 baris =
// 1 kegiatan selesai, input/output/reject per satuan stage, urutan bebas.
// =============================================================================

import { eq, and, isNull, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import db from "@/db";
import { batchStageEvent, batch } from "@/db/schema/box";
import { machine } from "@/db/schema/master-product";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";

export const CHAIN_STAGES = ["WR", "SLOP", "BAL"] as const;
export type ChainStage = (typeof CHAIN_STAGES)[number];

// Progress batch: urutan stage untuk update stage tertinggi
const STAGE_RANK: Record<string, number> = {
  PACKED: 0,
  WRAPPED: 1,
  SLOPPED: 2,
  BALED: 3,
};

export const STAGE_UNIT: Record<ChainStage, string> = {
  WR: "PACK",
  SLOP: "SLOP",
  BAL: "BAL",
};

export interface CreateStageEventInput {
  plantId: string;
  batchId: string;
  stage: ChainStage;
  machineId?: string;
  inputQty: number;
  outputQty: number;
  rejectQty: number;
  notes?: string;
  operatorBy: string;
}

export async function createBatchStageEvent(input: CreateStageEventInput) {
  const [b] = await db
    .select({ id: batch.id, code: batch.code, stage: batch.stage })
    .from(batch)
    .where(eq(batch.id, input.batchId))
    .limit(1);
  if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan.");

  if (input.inputQty < 0 || input.outputQty < 0 || input.rejectQty < 0) {
    throw new ServiceError("INVALID_QTY", "Jumlah tidak boleh negatif.");
  }
  if (input.inputQty + input.outputQty + input.rejectQty === 0) {
    throw new ServiceError("EMPTY_EVENT", "Isi minimal satu jumlah.");
  }

  // Mesin opsional (karton manual tidak dicatat di sini — hanya pemakaian material)
  let machineId: string | null = null;
  if (input.machineId) {
    const [m] = await db
      .select({ id: machine.id })
      .from(machine)
      .where(and(eq(machine.id, input.machineId), isNull(machine.deletedAt)))
      .limit(1);
    if (!m) throw new ServiceError("MACHINE_NOT_FOUND", "Mesin tidak ditemukan.");
    machineId = input.machineId;
  }

  const unit = STAGE_UNIT[input.stage];
  const [ev] = await db
    .insert(batchStageEvent)
    .values({
      batchId: input.batchId,
      plantId: input.plantId,
      stage: input.stage,
      machineId,
      inputQty: String(input.inputQty),
      outputQty: String(input.outputQty),
      rejectQty: String(input.rejectQty),
      unit,
      operatorBy: input.operatorBy,
      notes: input.notes?.trim() || null,
    })
    .returning();
  if (!ev) throw new ServiceError("CREATE_FAILED", "Gagal mencatat stage event.");

  // Progress batch = stage tertinggi yang sudah dicatat (urutan bebas)
  const newStage = input.stage === "WR" ? "WRAPPED" : input.stage === "SLOP" ? "SLOPPED" : "BALED";
  if ((STAGE_RANK[newStage] ?? 0) > (STAGE_RANK[b.stage] ?? 0)) {
    await db
      .update(batch)
      .set({ stage: newStage })
      .where(eq(batch.id, input.batchId));
  }

  await writeAudit({
    actorUserId: input.operatorBy,
    action: "batch.stage_event.create",
    entityTable: "batch_stage_event",
    entityId: ev.id,
    after: {
      batchCode: b.code,
      stage: input.stage,
      inputQty: input.inputQty,
      outputQty: input.outputQty,
      rejectQty: input.rejectQty,
    },
  });

  return { ...ev, inputQty: Number(ev.inputQty), outputQty: Number(ev.outputQty), rejectQty: Number(ev.rejectQty) };
}

export async function listBatchStageEvents(batchId: string) {
  return db
    .select({
      id: batchStageEvent.id,
      batchId: batchStageEvent.batchId,
      stage: batchStageEvent.stage,
      machineId: batchStageEvent.machineId,
      machineCode: machine.code,
      inputQty: batchStageEvent.inputQty,
      outputQty: batchStageEvent.outputQty,
      rejectQty: batchStageEvent.rejectQty,
      unit: batchStageEvent.unit,
      operatorByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${batchStageEvent.operatorBy})`.mapWith(String),
      eventAt: batchStageEvent.eventAt,
      notes: batchStageEvent.notes,
    })
    .from(batchStageEvent)
    .leftJoin(machine, eq(batchStageEvent.machineId, machine.id))
    .where(and(eq(batchStageEvent.batchId, batchId), isNull(batchStageEvent.deletedAt)))
    .orderBy(desc(batchStageEvent.eventAt))
    .limit(100);
}
