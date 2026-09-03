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
import { batchStageEvent, batch, hlpPack } from "@/db/schema/box";
import { hlpShift } from "@/db/schema/hlp";
import { machine } from "@/db/schema/master-product";
import { writeAudit } from "@/lib/audit";
import {
  addRijekanEntry,
  deriveRijekanContextFromBatch,
  type RijekanUnit,
} from "./rijekan.service";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

export const CHAIN_STAGES = ["WR", "SLOP", "BAL"] as const;
export type ChainStage = (typeof CHAIN_STAGES)[number];

// Progress batch: urutan stage untuk update stage tertinggi
const STAGE_RANK: Record<string, number> = {
  PACKED: 0,
  WRAPPED: 1,
  SLOPPED: 2,
  BALED: 3,
};

export const STAGE_UNIT: Record<ChainStage, RijekanUnit> = {
  WR: "PACK",
  SLOP: "SLOP",
  BAL: "BAL",
};

// Produk jadi target per batch (0030) — menentukan rantai stage wajib.
// BATANGAN (docs/26 §1): produk final #1 — tanpa HLP/stage, langsung keluar.
export type BatchTargetUnit = "PACK" | "PACK_WRAP" | "SLOP" | "BAL" | "BATANGAN";
export const BATCH_TARGETS: BatchTargetUnit[] = ["PACK", "PACK_WRAP", "SLOP", "BAL", "BATANGAN"];
export const TARGET_STAGES: Record<BatchTargetUnit, ChainStage[]> = {
  PACK: [],
  PACK_WRAP: ["WR"],
  SLOP: ["WR", "SLOP"],
  BAL: ["WR", "SLOP", "BAL"],
  BATANGAN: [],
};

export interface CreateStageEventInput {
  plantId: string;
  batchId: string;
  stage: ChainStage;
  machineId?: string;
  inputQty: number;
  outputQty: number;
  rejectQty: number;
  // Rasio input per 1 output — SLOP: pack/slop, BAL: slop/bal (0032, fleksibel)
  isiPerUnit?: number;
  // Sisa input tidak terpakai — angka resmi untuk isi karton (0032)
  sisaQty?: number;
  notes?: string;
  operatorBy: string;
}

export async function createBatchStageEvent(input: CreateStageEventInput) {
  const [b] = await db
    .select({ id: batch.id, code: batch.code, stage: batch.stage, targetUnit: batch.targetUnit, source: batch.source })
    .from(batch)
    .where(eq(batch.id, input.batchId))
    .limit(1);
  if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan.");

  if (input.inputQty < 0 || input.outputQty < 0 || input.rejectQty < 0 || (input.sisaQty ?? 0) < 0) {
    throw new ServiceError("INVALID_QTY", "Jumlah tidak boleh negatif.");
  }
  if (input.isiPerUnit != null && input.isiPerUnit < 1) {
    throw new ServiceError("INVALID_QTY", "Isi per unit harus minimal 1.");
  }
  if (input.inputQty + input.outputQty + input.rejectQty + (input.sisaQty ?? 0) === 0) {
    throw new ServiceError("EMPTY_EVENT", "Isi minimal satu jumlah.");
  }

  // Konservasi LUNAK (docs/26 §7): input = output × rasio + rijek + sisa.
  // WR rasio 1:1; SLOP/BAL pakai isiPerUnit (kalau tidak diisi, tidak dicek).
  // Mismatch → conservationWarning di response (BUKAN penolakan).
  let conservationWarning: string | null = null;
  const ratio = input.stage === "WR" ? 1 : (input.isiPerUnit ?? null);
  if (ratio != null) {
    const expected = input.outputQty * ratio + input.rejectQty + (input.sisaQty ?? 0);
    if (Math.abs(expected - input.inputQty) > 0.001) {
      conservationWarning =
        `Input ${input.inputQty} tidak sesuai hitungan output × ${ratio} + rijek + sisa = ${expected}.`;
    }
  }

  // Validasi target (0030) hanya untuk batch INTERNAL. Batch EXTERNAL
  // (makloon) mengikuti model entry/exit stage (docs/25 §4) — urutan bebas.
  if ((b.source ?? "INTERNAL") === "INTERNAL") {
    const target = (b.targetUnit ?? "PACK") as BatchTargetUnit;
    const requiredStages = TARGET_STAGES[target] ?? [];
    const stageIndex = requiredStages.indexOf(input.stage);
    if (stageIndex === -1) {
      throw new ServiceError(
        "STAGE_NOT_IN_TARGET",
        `Target batch ini ${target} — stage ${input.stage} tidak diperlukan. Ubah target dulu bila produk jadinya berubah.`,
        { targetUnit: target, stage: input.stage }
      );
    }
    // Packing HLP wajib ada sebelum stage pertama rantai (WR) — input WR
    // secara fisik adalah pack hasil HLP, jadi tanpa catatan packing angka WR
    // tidak punya dasar (keputusan diskusi 3 Sep 2026).
    if (input.stage === "WR") {
      const [packRow] = await db
        .select({ id: hlpPack.id })
        .from(hlpPack)
        .where(eq(hlpPack.batchId, input.batchId))
        .limit(1);
      if (!packRow) {
        throw new ServiceError(
          "PACKING_REQUIRED",
          "Catat packing HLP dulu sebelum mencatat stage WR.",
          { targetUnit: target, stage: input.stage }
        );
      }
    }
    if (stageIndex > 0) {
      const prevStage = requiredStages[stageIndex - 1]!;
      const [prevEvent] = await db
        .select({ id: batchStageEvent.id })
        .from(batchStageEvent)
        .where(
          and(
            eq(batchStageEvent.batchId, input.batchId),
            eq(batchStageEvent.stage, prevStage),
            isNull(batchStageEvent.deletedAt)
          )
        )
        .limit(1);
      if (!prevEvent) {
        throw new ServiceError(
          "STAGE_SEQUENCE_REQUIRED",
          `Target ${target}: catat stage ${prevStage} dulu sebelum ${input.stage}.`,
          { targetUnit: target, missingStage: prevStage, stage: input.stage }
        );
      }
    }
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

  // Sesi HLP OPEN wajib (keputusan 3 Sep 2026): dengan mesin → sesi mesin itu;
  // tanpa mesin → minimal satu sesi OPEN di plant.
  const [openShift] = await db
    .select({ id: hlpShift.id })
    .from(hlpShift)
    .where(
      machineId
        ? and(eq(hlpShift.hlpMachineId, machineId), eq(hlpShift.status, "OPEN"), isNull(hlpShift.deletedAt))
        : and(eq(hlpShift.plantId, input.plantId), eq(hlpShift.status, "OPEN"), isNull(hlpShift.deletedAt))
    )
    .limit(1);
  if (!openShift) {
    throw new ServiceError(
      "HLP_SESSION_REQUIRED",
      machineId
        ? "Buka sesi HLP untuk mesin ini dulu sebelum mencatat stage."
        : "Buka sesi HLP dulu sebelum mencatat stage."
    );
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
      // WR tidak punya rasio (1:1) — hanya SLOP/BAL
      isiPerUnit: input.stage === "WR" ? null : input.isiPerUnit ?? null,
      sisaQty: input.sisaQty ?? null,
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
      isiPerUnit: input.isiPerUnit ?? null,
      sisaQty: input.sisaQty ?? null,
    },
  });

  // Sink pool rijekan (docs/26 §3.2): reject stage masuk ledger dengan
  // identitas lot di-derive dari batch. Fire-and-forget — gagal tidak
  // menggagalkan pencatatan stage.
  if (input.rejectQty > 0) {
    void (async () => {
      const ctx = await deriveRijekanContextFromBatch(input.batchId);
      await addRijekanEntry({
        plantId: input.plantId,
        entryType: "IN_STAGE_REJECT",
        quantity: input.rejectQty,
        unit,
        refId: ev.id,
        note: input.notes?.trim() || undefined,
        tsgType: ctx.tsgType,
        origin: ctx.origin,
        makloonOrderId: ctx.makloonOrderId,
      });
    })();
  }

  return {
    ...ev,
    inputQty: Number(ev.inputQty),
    outputQty: Number(ev.outputQty),
    rejectQty: Number(ev.rejectQty),
    isiPerUnit: ev.isiPerUnit == null ? null : Number(ev.isiPerUnit),
    sisaQty: ev.sisaQty == null ? null : Number(ev.sisaQty),
    conservationWarning,
  };
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
      isiPerUnit: batchStageEvent.isiPerUnit,
      sisaQty: batchStageEvent.sisaQty,
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

// =============================================================================
// Set Produk Jadi Target — diputuskan di HLP (0030)
// Sebelum ada event stage: bebas ubah. Setelah ada: wajib alasan + audit,
// dan target baru tidak boleh mengecualikan stage yang sudah dicatat.
// =============================================================================

export async function setBatchTarget(input: {
  batchId: string;
  targetUnit: BatchTargetUnit;
  reason?: string;
  actorUserId: string;
}) {
  const [b] = await db
    .select({ id: batch.id, code: batch.code, targetUnit: batch.targetUnit })
    .from(batch)
    .where(eq(batch.id, input.batchId))
    .limit(1);
  if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan.");

  if (b.targetUnit === input.targetUnit) {
    return { batchId: b.id, targetUnit: b.targetUnit };
  }

  const recordedStages = await db
    .select({ stage: batchStageEvent.stage })
    .from(batchStageEvent)
    .where(and(eq(batchStageEvent.batchId, input.batchId), isNull(batchStageEvent.deletedAt)));

  // Packing HLP juga jadi alasan wajib (keputusan 3 Sep 2026 — docs/26 §1):
  // batch yang sudah di-packing tidak boleh ganti target diam-diam.
  const [packRow] = await db
    .select({ id: hlpPack.id })
    .from(hlpPack)
    .where(eq(hlpPack.batchId, input.batchId))
    .limit(1);

  if (recordedStages.length > 0 || packRow) {
    if (!input.reason?.trim()) {
      throw new ServiceError(
        "TARGET_CHANGE_REASON_REQUIRED",
        "Batch sudah punya catatan packing/stage — perubahan target wajib disertai alasan."
      );
    }
    const allowed = TARGET_STAGES[input.targetUnit];
    const conflict = recordedStages.find((r) => !allowed.includes(r.stage as ChainStage));
    if (conflict) {
      throw new ServiceError(
        "TARGET_CONFLICTS_EVENTS",
        `Target ${input.targetUnit} tidak mencakup stage ${conflict.stage} yang sudah dicatat.`,
        { targetUnit: input.targetUnit, conflictingStage: conflict.stage }
      );
    }
  }

  await db
    .update(batch)
    .set({ targetUnit: input.targetUnit })
    .where(eq(batch.id, input.batchId));

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "batch.target.set",
    entityTable: "batch",
    entityId: input.batchId,
    before: { targetUnit: b.targetUnit },
    after: { targetUnit: input.targetUnit, reason: input.reason?.trim() || null },
  });

  return { batchId: b.id, targetUnit: input.targetUnit };
}
