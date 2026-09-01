// =============================================================================
// Makloon Service — penerimaan batangan external + keluaran pack ke customer
// =============================================================================
// docs/24-external-batangan.md: order packing dari luar. Batangan diterima
// (kg) di gudang → approval PM/supervisor → jadi batch source=EXTERNAL
// (kode btx_) → diproses HLP seperti biasa → pack + rijekan dikembalikan ke
// customer (per batch, dengan PDF serah terima).
// =============================================================================

import { eq, and, isNull, sql, desc } from "drizzle-orm";
import db from "@/db";
import {
  externalBatanganReceiving,
  externalPackOut,
} from "@/db/schema";
import { batch, hlpPack } from "@/db/schema/box";
import { plant } from "@/db/schema/tenancy";
import { writeAudit } from "@/lib/audit";
import { notifyExternalBatanganPending } from "./fcm.service";
import { ServiceError } from "./shift.service";

// =============================================================================
// Penerimaan
// =============================================================================

export const ENTRY_STAGES = ["BATANGAN", "PACK", "PACK_WRAPPED", "SLOP", "BAL"] as const;
export type EntryStage = (typeof ENTRY_STAGES)[number];

export const ENTRY_UNIT: Record<EntryStage, string> = {
  BATANGAN: "KG",
  PACK: "PACK",
  PACK_WRAPPED: "PACK",
  SLOP: "SLOP",
  BAL: "BAL",
};

// Stage batch saat approve sesuai entry (docs/25 §4)
export const ENTRY_BATCH_STAGE: Record<EntryStage, string> = {
  BATANGAN: "PACKED",
  PACK: "PACKED",
  PACK_WRAPPED: "WRAPPED",
  SLOP: "SLOPPED",
  BAL: "BALED",
};

export interface CreateExternalReceivingInput {
  plantId: string;
  senderName: string;
  docRef?: string;
  batanganKg: number; // kg untuk BATANGAN; jumlah satuan stage untuk entry lain
  entryStage?: EntryStage;
  receivedBy: string;
  notes?: string;
}

export async function createExternalReceiving(input: CreateExternalReceivingInput) {
  if (!input.senderName.trim()) {
    throw new ServiceError("SENDER_REQUIRED", "Nama pengirim wajib diisi.");
  }
  if (input.batanganKg <= 0 || input.batanganKg > 10000) {
    throw new ServiceError("INVALID_KG", "Berat/jumlah harus 0-10000.");
  }

  const entryStage: EntryStage = input.entryStage ?? "BATANGAN";

  const [r] = await db
    .insert(externalBatanganReceiving)
    .values({
      plantId: input.plantId,
      senderName: input.senderName.trim(),
      docRef: input.docRef?.trim() || null,
      batanganKg: String(input.batanganKg),
      entryStage,
      entryUnit: ENTRY_UNIT[entryStage],
      receivedBy: input.receivedBy,
      notes: input.notes?.trim() || null,
    })
    .returning();
  if (!r) throw new ServiceError("CREATE_FAILED", "Gagal mencatat penerimaan external.");

  await writeAudit({
    actorUserId: input.receivedBy,
    action: "external_batangan.create",
    entityTable: "external_batangan_receiving",
    entityId: r.id,
    after: { senderName: input.senderName, batanganKg: input.batanganKg, entryStage, approvalStatus: "PENDING" },
  });

  // Push ke PM + supervisor (fire-and-forget)
  void notifyExternalBatanganPending({
    receivingId: r.id,
    plantId: input.plantId,
    senderName: input.senderName,
    batanganKg: input.batanganKg,
  });

  return r;
}

export async function listExternalReceivings(plantId: string, status?: string) {
  return db
    .select({
      id: externalBatanganReceiving.id,
      senderName: externalBatanganReceiving.senderName,
      docRef: externalBatanganReceiving.docRef,
      batanganKg: externalBatanganReceiving.batanganKg,
      entryStage: externalBatanganReceiving.entryStage,
      entryUnit: externalBatanganReceiving.entryUnit,
      receivedAt: externalBatanganReceiving.receivedAt,
      receivedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${externalBatanganReceiving.receivedBy})`.mapWith(String),
      approvalStatus: externalBatanganReceiving.approvalStatus,
      rejectionReason: externalBatanganReceiving.rejectionReason,
      batchCode: sql<string>`(SELECT b.code FROM batch b WHERE b.id = ${externalBatanganReceiving.batchId})`.mapWith(String),
      notes: externalBatanganReceiving.notes,
    })
    .from(externalBatanganReceiving)
    .where(
      and(
        eq(externalBatanganReceiving.plantId, plantId),
        isNull(externalBatanganReceiving.deletedAt),
        ...(status ? [eq(externalBatanganReceiving.approvalStatus, status)] : [])
      )
    )
    .orderBy(desc(externalBatanganReceiving.receivedAt))
    .limit(100);
}

export async function getExternalReceivingDetail(id: string) {
  const [r] = await db
    .select({
      id: externalBatanganReceiving.id,
      plantId: externalBatanganReceiving.plantId,
      senderName: externalBatanganReceiving.senderName,
      docRef: externalBatanganReceiving.docRef,
      batanganKg: externalBatanganReceiving.batanganKg,
      entryStage: externalBatanganReceiving.entryStage,
      entryUnit: externalBatanganReceiving.entryUnit,
      receivedAt: externalBatanganReceiving.receivedAt,
      receivedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${externalBatanganReceiving.receivedBy})`.mapWith(String),
      approvalStatus: externalBatanganReceiving.approvalStatus,
      approvedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${externalBatanganReceiving.approvedBy})`.mapWith(String),
      approvedAt: externalBatanganReceiving.approvedAt,
      rejectionReason: externalBatanganReceiving.rejectionReason,
      rejectedByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${externalBatanganReceiving.rejectedBy})`.mapWith(String),
      rejectedAt: externalBatanganReceiving.rejectedAt,
      batchId: externalBatanganReceiving.batchId,
      batchCode: sql<string>`(SELECT b.code FROM batch b WHERE b.id = ${externalBatanganReceiving.batchId})`.mapWith(String),
      notes: externalBatanganReceiving.notes,
    })
    .from(externalBatanganReceiving)
    .where(eq(externalBatanganReceiving.id, id))
    .limit(1);
  return r ?? null;
}

// Kode batch external: btx_<YYYYMMDD>_<NN> — prefix sendiri supaya tidak
// tabrak sequence MAKER (btc_) dan unik global (kolom code unique).
async function nextExternalBatchCode(exec: Pick<typeof db, "select">): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `btx_${datePart}_`;
  const rows = await exec
    .select({ code: batch.code })
    .from(batch)
    .where(sql`${batch.code} LIKE ${prefix + "%"}`);
  let maxSeq = 0;
  for (const r of rows) {
    const m = /-(\d+)$|_(\d+)$/.exec(r.code);
    if (m?.[2]) maxSeq = Math.max(maxSeq, parseInt(m[2], 10));
    else if (m?.[1]) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
}

export async function approveExternalReceiving(
  id: string,
  plantId: string,
  actorUserId: string
) {
  const [r] = await db
    .select()
    .from(externalBatanganReceiving)
    .where(eq(externalBatanganReceiving.id, id))
    .limit(1);
  if (!r) throw new ServiceError("NOT_FOUND", "Penerimaan external tidak ditemukan.");
  if (r.plantId !== plantId) throw new ServiceError("WRONG_PLANT", "Penerimaan bukan untuk plant ini.");
  if (r.approvalStatus !== "PENDING") {
    throw new ServiceError(
      r.approvalStatus === "REJECTED" ? "ALREADY_REJECTED" : "ALREADY_APPROVED",
      r.approvalStatus === "REJECTED" ? "Penerimaan sudah ditolak." : "Penerimaan sudah di-approve."
    );
  }

  const code = await nextExternalBatchCode(db);

  // Entry stage menentukan progress awal batch (docs/25 §4): pack terwrap
  // masuk = batch lahir di stage WRAPPED, dst. batanganKg hanya bermakna
  // untuk entry BATANGAN (kg) — entry lain pakai satuan stage.
  const entryStage = (r.entryStage as EntryStage) || "BATANGAN";
  const [b] = await db
    .insert(batch)
    .values({
      plantId: r.plantId,
      shiftReportId: null, // bukan produksi MAKER
      machineId: null,
      source: "EXTERNAL",
      externalReceivingId: r.id,
      stage: ENTRY_BATCH_STAGE[entryStage],
      code,
      batanganKg: entryStage === "BATANGAN" ? r.batanganKg : "0",
    })
    .returning();
  if (!b) throw new ServiceError("BATCH_CREATE_FAILED", "Gagal membuat batch external.");

  await db
    .update(externalBatanganReceiving)
    .set({ approvalStatus: "APPROVED", approvedBy: actorUserId, approvedAt: new Date(), batchId: b.id })
    .where(eq(externalBatanganReceiving.id, id));

  await writeAudit({
    actorUserId,
    action: "external_batangan.approve",
    entityTable: "external_batangan_receiving",
    entityId: id,
    before: { approvalStatus: "PENDING" },
    after: { approvalStatus: "APPROVED", batchCode: code },
  });

  return { receivingId: id, approvalStatus: "APPROVED", batchId: b.id, batchCode: code };
}

export async function rejectExternalReceiving(
  id: string,
  plantId: string,
  actorUserId: string,
  reason: string
) {
  const [r] = await db
    .select()
    .from(externalBatanganReceiving)
    .where(eq(externalBatanganReceiving.id, id))
    .limit(1);
  if (!r) throw new ServiceError("NOT_FOUND", "Penerimaan external tidak ditemukan.");
  if (r.plantId !== plantId) throw new ServiceError("WRONG_PLANT", "Penerimaan bukan untuk plant ini.");
  if (r.approvalStatus !== "PENDING") {
    throw new ServiceError(
      r.approvalStatus === "REJECTED" ? "ALREADY_REJECTED" : "ALREADY_APPROVED",
      r.approvalStatus === "REJECTED" ? "Penerimaan sudah ditolak." : "Penerimaan sudah di-approve."
    );
  }
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    throw new ServiceError("REJECT_REASON_REQUIRED", "Catatan penolakan wajib (min 3 karakter).");
  }

  await db
    .update(externalBatanganReceiving)
    .set({ approvalStatus: "REJECTED", rejectionReason: trimmed, rejectedBy: actorUserId, rejectedAt: new Date() })
    .where(eq(externalBatanganReceiving.id, id));

  await writeAudit({
    actorUserId,
    action: "external_batangan.reject",
    entityTable: "external_batangan_receiving",
    entityId: id,
    before: { approvalStatus: "PENDING" },
    after: { approvalStatus: "REJECTED", rejectionReason: trimmed },
  });

  return { receivingId: id, approvalStatus: "REJECTED", rejectionReason: trimmed };
}

// =============================================================================
// Keluaran ke customer (per batch langsung — docs/24 §2)
// =============================================================================

export interface CreateExternalPackOutInput {
  plantId: string;
  batchId: string;
  destinationName: string;
  docRef?: string;
  packQty: number;
  rejectPackQty: number;
  rejectBatangQty: number;
  exitStage?: EntryStage;
  outBy: string;
}

export async function createExternalPackOut(input: CreateExternalPackOutInput) {
  const [b] = await db
    .select({ id: batch.id, code: batch.code, source: batch.source, externalReceivingId: batch.externalReceivingId })
    .from(batch)
    .where(eq(batch.id, input.batchId))
    .limit(1);
  if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan.");
  if (b.source !== "EXTERNAL") {
    throw new ServiceError("NOT_EXTERNAL_BATCH", `Batch ${b.code} bukan batch makloon external.`);
  }
  if (!input.destinationName.trim()) {
    throw new ServiceError("DESTINATION_REQUIRED", "Nama customer tujuan wajib diisi.");
  }
  if (input.packQty < 0 || input.rejectPackQty < 0 || input.rejectBatangQty < 0) {
    throw new ServiceError("INVALID_QTY", "Jumlah tidak boleh negatif.");
  }
  if (input.packQty + input.rejectPackQty + input.rejectBatangQty === 0) {
    throw new ServiceError("EMPTY_OUT", "Isi minimal satu jumlah (pack / reject).");
  }

  // Entry stage batch menentukan aturan validasi (docs/25 §4):
  // - BATANGAN: wajib sudah di-packing HLP; keluar divalidasi vs packsLolos/reject.
  // - PACK/PACK_WRAPPED/SLOP/BAL: tanpa packing HLP; keluar (pack + reject stage)
  //   divalidasi vs jumlah entry (satuan stage); reject batangan harus 0.
  const [recv] = await db
    .select({ entryStage: externalBatanganReceiving.entryStage, batanganKg: externalBatanganReceiving.batanganKg })
    .from(externalBatanganReceiving)
    .where(eq(externalBatanganReceiving.id, b.externalReceivingId!))
    .limit(1);
  const entryStage: EntryStage = (recv?.entryStage as EntryStage) || "BATANGAN";
  const exitStage: EntryStage = input.exitStage ?? (entryStage === "BATANGAN" ? "PACK" : entryStage);

  // Akumulasi keluar sebelumnya
  const [agg] = await db
    .select({
      packQty: sql<number>`COALESCE(SUM(${externalPackOut.packQty}), 0)::int`.mapWith(Number),
      rejectPackQty: sql<number>`COALESCE(SUM(${externalPackOut.rejectPackQty}), 0)::int`.mapWith(Number),
      rejectBatangQty: sql<number>`COALESCE(SUM(${externalPackOut.rejectBatangQty}), 0)::int`.mapWith(Number),
    })
    .from(externalPackOut)
    .where(and(eq(externalPackOut.batchId, input.batchId), isNull(externalPackOut.deletedAt)));
  const prev = agg ?? { packQty: 0, rejectPackQty: 0, rejectBatangQty: 0 };

  if (entryStage === "BATANGAN") {
    // Packing batch ini wajib sudah dicatat HLP
    const [pack] = await db
      .select({
        packsLolos: hlpPack.packsLolos,
        rejectPacks: hlpPack.rejectPacks,
        rejectBatangan: hlpPack.rejectBatangan,
      })
      .from(hlpPack)
      .where(eq(hlpPack.batchId, input.batchId))
      .limit(1);
    if (!pack) {
      throw new ServiceError("NOT_PACKED_YET", "Batch ini belum dicatat packingnya di HLP.");
    }

    if (prev.packQty + input.packQty > pack.packsLolos) {
      throw new ServiceError(
        "PACK_EXCEEDS",
        `Pack keluar melebihi pack lolos tercatat (${pack.packsLolos}; sudah keluar ${prev.packQty}).`,
        { packsLolos: pack.packsLolos, sudahKeluar: prev.packQty }
      );
    }
    if (prev.rejectPackQty + input.rejectPackQty > pack.rejectPacks) {
      throw new ServiceError(
        "REJECT_PACK_EXCEEDS",
        `Reject pack melebihi yang tercatat (${pack.rejectPacks}).`,
        { rejectPacks: pack.rejectPacks }
      );
    }
    if (prev.rejectBatangQty + input.rejectBatangQty > pack.rejectBatangan) {
      throw new ServiceError(
        "REJECT_BATANG_EXCEEDS",
        `Reject batangan melebihi yang tercatat (${pack.rejectBatangan}).`,
        { rejectBatangan: pack.rejectBatangan }
      );
    }
  } else {
    // Entry non-batangan: validasi vs jumlah entry dalam satuan stage
    if (input.rejectBatangQty > 0) {
      throw new ServiceError(
        "REJECT_BATANG_NOT_APPLICABLE",
        "Reject batangan hanya untuk order masuk BATANGAN."
      );
    }
    const entryQty = Number(recv?.batanganKg ?? 0);
    if (prev.packQty + prev.rejectPackQty + input.packQty + input.rejectPackQty > entryQty) {
      throw new ServiceError(
        "OUT_EXCEEDS_ENTRY",
        `Keluaran melebihi jumlah entry ${entryStage} (${entryQty}; sudah keluar ${prev.packQty + prev.rejectPackQty}).`,
        { entryQty, sudahKeluar: prev.packQty + prev.rejectPackQty }
      );
    }
  }

  const [out] = await db
    .insert(externalPackOut)
    .values({
      plantId: input.plantId,
      batchId: input.batchId,
      destinationName: input.destinationName.trim(),
      docRef: input.docRef?.trim() || null,
      packQty: input.packQty,
      rejectPackQty: input.rejectPackQty,
      rejectBatangQty: input.rejectBatangQty,
      exitStage,
      outBy: input.outBy,
    })
    .returning();
  if (!out) throw new ServiceError("CREATE_FAILED", "Gagal mencatat keluaran makloon.");

  await writeAudit({
    actorUserId: input.outBy,
    action: "external_pack_out.create",
    entityTable: "external_pack_out",
    entityId: out.id,
    after: {
      batchCode: b.code,
      destinationName: input.destinationName.trim(),
      packQty: input.packQty,
      rejectPackQty: input.rejectPackQty,
      rejectBatangQty: input.rejectBatangQty,
      exitStage,
    },
  });

  return { ...out, batchCode: b.code };
}

export async function listExternalPackOuts(plantId: string) {
  return db
    .select({
      id: externalPackOut.id,
      batchId: externalPackOut.batchId,
      batchCode: sql<string>`(SELECT b.code FROM batch b WHERE b.id = ${externalPackOut.batchId})`.mapWith(String),
      destinationName: externalPackOut.destinationName,
      docRef: externalPackOut.docRef,
      packQty: externalPackOut.packQty,
      rejectPackQty: externalPackOut.rejectPackQty,
      rejectBatangQty: externalPackOut.rejectBatangQty,
      exitStage: externalPackOut.exitStage,
      outAt: externalPackOut.outAt,
      outByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${externalPackOut.outBy})`.mapWith(String),
    })
    .from(externalPackOut)
    .where(and(eq(externalPackOut.plantId, plantId), isNull(externalPackOut.deletedAt)))
    .orderBy(desc(externalPackOut.outAt))
    .limit(100);
}

export async function getExternalPackOutDetail(id: string) {
  const [out] = await db
    .select({
      id: externalPackOut.id,
      plantId: externalPackOut.plantId,
      batchId: externalPackOut.batchId,
      batchCode: sql<string>`(SELECT b.code FROM batch b WHERE b.id = ${externalPackOut.batchId})`.mapWith(String),
      batanganKg: sql<string>`(SELECT b.batangan_kg::text FROM batch b WHERE b.id = ${externalPackOut.batchId})`.mapWith(String),
      destinationName: externalPackOut.destinationName,
      docRef: externalPackOut.docRef,
      packQty: externalPackOut.packQty,
      rejectPackQty: externalPackOut.rejectPackQty,
      rejectBatangQty: externalPackOut.rejectBatangQty,
      exitStage: externalPackOut.exitStage,
      entryStage: sql<string>`(SELECT er.entry_stage FROM external_batangan_receiving er WHERE er.batch_id = ${externalPackOut.batchId})`.mapWith(String),
      // Estimasi berat (docs/24 §6.1 — dijawab: sertakan estimasi)
      isiPerPack: sql<number>`(SELECT hp.isi_per_pack::int FROM hlp_pack hp WHERE hp.batch_id = ${externalPackOut.batchId} LIMIT 1)`.mapWith(Number),
      beratPerBatangGram: sql<number>`(SELECT hp.berat_per_batang_gram::numeric FROM hlp_pack hp WHERE hp.batch_id = ${externalPackOut.batchId} LIMIT 1)`.mapWith(Number),
      outAt: externalPackOut.outAt,
      outByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${externalPackOut.outBy})`.mapWith(String),
      plantName: plant.name,
      plantCode: plant.code,
    })
    .from(externalPackOut)
    .leftJoin(plant, eq(externalPackOut.plantId, plant.id))
    .where(eq(externalPackOut.id, id))
    .limit(1);
  return out ?? null;
}
