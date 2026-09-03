// =============================================================================
// Box Service — Business Logic Boks TSG & Production Events
// =============================================================================

import { eq, and, isNull, isNotNull, sql, inArray, desc } from "drizzle-orm";
import db from "@/db";
import {
  shiftReport,
  tsgBoxSession,
  tsgBoxProcess,
  tsgBoxConsumption,
  downtimeLog,
  maintenanceEvent,
  tsgInventory,
  batch,
  hlpPack,
  batchStageEvent,
  tsgReceivingBox,
} from "@/db/schema";
import { cartonContent } from "@/db/schema/wms-outbound";
import { hlpShift } from "@/db/schema/hlp";
import { machineTemplate, machine } from "@/db/schema/master-product";
import { calculateYieldPct, getYieldIndicator, calculateBeratPerBatangGram, calculateTotalBatang, splitBatanganProportional } from "@/lib/calc";
import { writeAudit } from "@/lib/audit";
import { addRijekanEntry, deriveRijekanContextFromBatch } from "./rijekan.service";
import { notifyHlpRejectHigh } from "./fcm.service";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// Ambang rasio reject (docs/23 §4.4) — reject batangan total / total batang.
// Default 5%; override via env REJECT_THRESHOLD_PCT kalau lapangan beda.
const HLP_REJECT_THRESHOLD_PCT =
  Number(process.env.HLP_REJECT_THRESHOLD_PCT ?? 5) / 100;

// =============================================================================
// Types
// =============================================================================

export interface OpenBoxInput {
  shiftReportId: string;
  plantId: string;
  inventoryBoxId?: string; // NULL untuk boks parsial (handoff)
}

export interface WeighBoxInput {
  boxId: string;
  outputWeightKg: number;
}

export interface ConsumptionInput {
  boxId?: string; // pemakaian level boks (alur lama/parsial)
  sessionId?: string; // pemakaian level sesi multi-boks (salah satu wajib)
  consumableItemId: string;
  quantity: number;
  note?: string;
  loggedBy: string;
  plantId: string;
}

export interface DowntimeInput {
  shiftReportId: string;
  plantId: string;
  category: "GANTI_MATERIAL" | "KENDALA_MESIN" | "TUNGGU_BAHAN" | "ISTIRAHAT_IZIN" | "MAINTENANCE";
  durationMinutes: number;
  linkedBoxId?: string;
  sessionId?: string; // entry level sesi multi-boks
  description?: string;
  loggedBy: string;
}

export interface MaintenanceInput {
  shiftReportId: string;
  plantId: string;
  sparepartId: string;
  quantity: number;
  linkedBoxId?: string;
  sessionId?: string; // entry level sesi multi-boks
  note?: string;
  loggedBy: string;
}

export interface HlpPackInput {
  batchId: string;
  hlpMachineId: string;
  plantId: string;
  packsLolos: number;
  isiPerPack: number;
  rejectBatangan: number;
  // Reject pack = pack utuh ditolak, dihitung sebagai batangan (docs/23 §4)
  rejectPacks?: number;
  rejectReason?: string;
  // Diisi otomatis dari sesi HLP OPEN mesin tsb — jangan di-set client
  hlpShiftId?: string | null;
}

export interface OpenBoxSessionInput {
  shiftReportId: string;
  plantId: string;
  inventoryBoxIds: string[]; // 1–6 boks pilihan operator (dari inventory gudang)
  realWeightKg?: Record<string, number>; // berat aktual timbangan pabrik per inventoryBoxId (opsional)
  actorUserId: string;
}

export interface WeighBoxSessionInput {
  sessionId: string;
  totalBatanganKg: number;
  actorUserId: string;
}

// =============================================================================
// Open Box (dari inventory atau partial handoff)
// =============================================================================

export async function openBox(input: OpenBoxInput) {
  // Validasi shift RUNNING
  const [shift] = await db
    .select({ id: shiftReport.id, status: shiftReport.status, productId: shiftReport.productId })
    .from(shiftReport)
    .where(eq(shiftReport.id, input.shiftReportId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");
  if (shift.status !== "RUNNING") {
    throw new ServiceError("SHIFT_NOT_RUNNING", "Hanya shift RUNNING yang bisa buka boks.");
  }

  // Cek tidak ada boks aktif lain
  const [activeBox] = await db
    .select({ id: tsgBoxProcess.id })
    .from(tsgBoxProcess)
    .where(
      and(
        eq(tsgBoxProcess.shiftReportId, input.shiftReportId),
        isNull(tsgBoxProcess.completedAt)
      )
    )
    .limit(1);

  if (activeBox) {
    throw new ServiceError("BOX_ALREADY_ACTIVE", "Masih ada boks aktif. Timbang dulu boks sebelumnya.");
  }

  // Get next box number
  const boxes = await db
    .select({ maxNum: sql<number>`COALESCE(MAX(${tsgBoxProcess.boxNumber}), 0)` })
    .from(tsgBoxProcess)
    .where(eq(tsgBoxProcess.shiftReportId, input.shiftReportId));

  const nextBoxNumber = (boxes[0]?.maxNum ?? 0) + 1;

  // Jika punya inventoryBoxId → validasi AVAILABLE
  let tsgWeightKg = "0";
  let boxCode = "";
  let isPartial = false;

  if (input.inventoryBoxId) {
    const [inventory] = await db
      .select()
      .from(tsgInventory)
      .where(eq(tsgInventory.id, input.inventoryBoxId))
      .limit(1);

    if (!inventory || inventory.status !== "AVAILABLE") {
      throw new ServiceError(
        "TSG_BOX_NOT_AVAILABLE",
        "Boks tidak tersedia di inventory. Cek daftar FIFO.",
        { inventoryBoxId: input.inventoryBoxId, currentStatus: inventory?.status ?? "NOT_FOUND" }
      );
    }

    // Get boxCode & weight dari receiving
    const [receivingBox] = await db
      .select({ boxCode: tsgReceivingBox.boxCode, weightKg: tsgReceivingBox.weightKg })
      .from(tsgReceivingBox)
      .where(eq(tsgReceivingBox.id, inventory.boxId))
      .limit(1);

    if (receivingBox) {
      boxCode = receivingBox.boxCode;
      tsgWeightKg = receivingBox.weightKg;
    } else {
      throw new ServiceError("BOX_WEIGHT_NOT_FOUND", "Data berat boks tidak ditemukan di receiving. Pastikan boks sudah diterima dengan benar.");
    }

    // Update inventory status → USED
    await db
      .update(tsgInventory)
      .set({ status: "USED", usedAt: new Date() })
      .where(eq(tsgInventory.id, input.inventoryBoxId));
  } else {
    // Boks partial dari handoff — isPartial=true
    isPartial = true;
  }

  // Create boks
  const [box] = await db
    .insert(tsgBoxProcess)
    .values({
      shiftReportId: input.shiftReportId,
      plantId: input.plantId,
      boxNumber: nextBoxNumber,
      boxCode: boxCode || null,
      tsgWeightKg,
      isPartial,
      inventoryBoxId: input.inventoryBoxId ?? null,
      openedAt: new Date(),
    })
    .returning();

  return box;
}

// =============================================================================
// Open Box Session — buka 1–6 boks pilihan operator dari inventory gudang
// =============================================================================

export async function openBoxSession(input: OpenBoxSessionInput) {
  // Validasi jumlah boks + tidak boleh ganda
  if (!Array.isArray(input.inventoryBoxIds) || input.inventoryBoxIds.length < 1 || input.inventoryBoxIds.length > 6) {
    throw new ServiceError("INVALID_BOX_COUNT", "Jumlah boks harus 1–6.");
  }
  if (new Set(input.inventoryBoxIds).size !== input.inventoryBoxIds.length) {
    throw new ServiceError("DUPLICATE_BOX", "Boks yang dipilih tidak boleh ganda.");
  }

  // Validasi shift RUNNING
  const [shift] = await db
    .select({ id: shiftReport.id, status: shiftReport.status })
    .from(shiftReport)
    .where(eq(shiftReport.id, input.shiftReportId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");
  if (shift.status !== "RUNNING") {
    throw new ServiceError("SHIFT_NOT_RUNNING", "Hanya shift RUNNING yang bisa buka boks.");
  }

  // Tidak boleh ada sesi OPEN lain di shift ini
  const [activeSession] = await db
    .select({ id: tsgBoxSession.id })
    .from(tsgBoxSession)
    .where(
      and(
        eq(tsgBoxSession.shiftReportId, input.shiftReportId),
        eq(tsgBoxSession.status, "OPEN")
      )
    )
    .limit(1);

  if (activeSession) {
    throw new ServiceError("BOX_ALREADY_ACTIVE", "Masih ada sesi boks aktif. Timbang dulu boks sebelumnya.");
  }

  // Ambil boks yang dipilih operator — harus AVAILABLE di plant ini
  const available = await db
    .select({ inventoryId: tsgInventory.id, boxId: tsgInventory.boxId, status: tsgInventory.status })
    .from(tsgInventory)
    .where(
      and(
        inArray(tsgInventory.id, input.inventoryBoxIds),
        eq(tsgInventory.plantId, input.plantId)
      )
    );

  if (available.length !== input.inventoryBoxIds.length) {
    throw new ServiceError(
      "TSG_BOX_NOT_AVAILABLE",
      "Ada boks yang tidak tersedia di inventory. Cek daftar boks di gudang."
    );
  }
  for (const a of available) {
    if (a.status !== "AVAILABLE") {
      throw new ServiceError(
        "TSG_BOX_NOT_AVAILABLE",
        "Ada boks yang statusnya bukan AVAILABLE. Muat ulang daftar inventory.",
        { inventoryBoxId: a.inventoryId, currentStatus: a.status }
      );
    }
  }

  // Pertahankan urutan pilihan operator
  const ordered = input.inventoryBoxIds.map((id) => available.find((a) => a.inventoryId === id)!);

  // Detail boxCode & berat dari receiving
  const boxIds = ordered.map((a) => a.boxId);
  const receiving = await db
    .select({ id: tsgReceivingBox.id, boxCode: tsgReceivingBox.boxCode, weightKg: tsgReceivingBox.weightKg })
    .from(tsgReceivingBox)
    .where(inArray(tsgReceivingBox.id, boxIds));

  const receivingMap = new Map(receiving.map((r) => [r.id, r]));
  for (const a of ordered) {
    if (!receivingMap.has(a.boxId)) {
      throw new ServiceError("BOX_WEIGHT_NOT_FOUND", "Data berat boks tidak ditemukan di receiving. Pastikan boks sudah diterima dengan benar.");
    }
  }

  // Box number berikutnya (berurutan per shift)
  const boxes = await db
    .select({ maxNum: sql<number>`COALESCE(MAX(${tsgBoxProcess.boxNumber}), 0)` })
    .from(tsgBoxProcess)
    .where(eq(tsgBoxProcess.shiftReportId, input.shiftReportId));

  const startNumber = (boxes[0]?.maxNum ?? 0) + 1;

  // Buat sesi + semua boks dalam transaksi
  const result = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(tsgBoxSession)
      .values({
        shiftReportId: input.shiftReportId,
        plantId: input.plantId,
        status: "OPEN",
      })
      .returning();

    const created: (typeof tsgBoxProcess.$inferSelect)[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i]!;
      const rec = receivingMap.get(a.boxId)!;

      // Berat aktual timbangan pabrik (opsional) — default berat supplier
      const realWeight = input.realWeightKg?.[a.inventoryId];
      if (realWeight != null && (realWeight <= 0 || realWeight > 100)) {
        throw new ServiceError("INVALID_BOX_WEIGHT", `Berat aktual boks ${rec.boxCode} harus 0-100 kg.`);
      }
      const tsgWeightKg = realWeight != null ? String(realWeight) : rec.weightKg;

      // Tandai inventory USED
      await tx
        .update(tsgInventory)
        .set({ status: "USED", usedAt: new Date() })
        .where(eq(tsgInventory.id, a.inventoryId));

      const [box] = await tx
        .insert(tsgBoxProcess)
        .values({
          shiftReportId: input.shiftReportId,
          plantId: input.plantId,
          sessionId: session!.id,
          boxNumber: startNumber + i,
          boxCode: rec.boxCode,
          tsgWeightKg,
          isPartial: false,
          inventoryBoxId: a.inventoryId,
          openedAt: new Date(),
        })
        .returning();

      created.push(box!);
    }

    return { session, boxes: created };
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "shift.box.open_session",
    entityTable: "tsg_box_session",
    entityId: result.session!.id,
    after: { boxCount: result.boxes.length, boxNumbers: result.boxes.map((b) => b.boxNumber) },
  });

  return result;
}

// =============================================================================
// Yield Template Helper — range yield machine MAKER untuk produk shift
// =============================================================================

async function getYieldTemplateForShift(shiftReportId: string) {
  const [shift] = await db
    .select({ productId: shiftReport.productId })
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftReportId))
    .limit(1);

  const [template] = await db
    .select({
      yieldMinPct: machineTemplate.yieldMinPct,
      yieldMaxPct: machineTemplate.yieldMaxPct,
    })
    .from(machineTemplate)
    .where(
      and(
        eq(machineTemplate.productId, shift?.productId ?? ""),
        eq(machineTemplate.machineType, "MAKER"),
        eq(machineTemplate.isCurrent, true)
      )
    )
    .limit(1);

  const yieldMin = template ? Number(template.yieldMinPct) : 110;
  const yieldMax = template ? Number(template.yieldMaxPct) : 114;
  return { yieldMin, yieldMax };
}

// =============================================================================
// Weigh Box (timbang hasil) → hitung yield server-side
// =============================================================================

export async function weighBox(input: WeighBoxInput) {
  const [box] = await db
    .select()
    .from(tsgBoxProcess)
    .where(eq(tsgBoxProcess.id, input.boxId))
    .limit(1);

  if (!box) throw new ServiceError("BOX_NOT_FOUND", "Boks tidak ditemukan.");
  if (box.completedAt) {
    throw new ServiceError("BOX_ALREADY_COMPLETED", "Boks sudah ditimbang.");
  }

  if (input.outputWeightKg <= 0) {
    throw new ServiceError("INVALID_WEIGHT", "Berat output harus > 0.");
  }

  const tsgWeight = Number(box.tsgWeightKg);
  if (tsgWeight <= 0) {
    throw new ServiceError("BOX_WEIGHT_INVALID", "Data berat TSG boks tidak valid (0 atau kosong). Pastikan boks dibuka dari inventory yang valid.");
  }

  // Dapatkan machine template untuk yield range
  const { yieldMin, yieldMax } = await getYieldTemplateForShift(box.shiftReportId);

  // Kalkulasi yield
  const yieldPct = calculateYieldPct(
    input.outputWeightKg,
    tsgWeight
  );
  const indicator = getYieldIndicator(yieldPct, { min: yieldMin, max: yieldMax });

  // Update boks
  const [updated] = await db
    .update(tsgBoxProcess)
    .set({
      outputWeightKg: String(input.outputWeightKg),
      yieldPct: String(yieldPct),
      completedAt: new Date(),
    })
    .where(eq(tsgBoxProcess.id, input.boxId))
    .returning();

  return {
    boxId: updated!.id,
    outputWeightKg: updated!.outputWeightKg,
    yieldPct,
    indicator,
    yieldRange: `${yieldMin}-${yieldMax}%`,
    completedAt: updated!.completedAt,
  };
}

// =============================================================================
// Weigh Box Session — timbang batangan kolektif 1–6 boks sekaligus
// Membuat batch dengan kode btc_<machine>_<date>_<seq> sebagai penanda
// bahan yang akan masuk ke mesin HLP. Berat dibagi proporsional bobot TSG.
// =============================================================================

export async function weighBoxSession(input: WeighBoxSessionInput) {
  const [session] = await db
    .select()
    .from(tsgBoxSession)
    .where(eq(tsgBoxSession.id, input.sessionId))
    .limit(1);

  if (!session) throw new ServiceError("SESSION_NOT_FOUND", "Sesi boks tidak ditemukan.");
  if (session.status !== "OPEN") {
    throw new ServiceError("SESSION_ALREADY_WEIGHED", "Sesi boks sudah ditimbang.");
  }
  if (input.totalBatanganKg <= 0) {
    throw new ServiceError("INVALID_WEIGHT", "Berat batangan total harus > 0.");
  }

  const boxes = await db
    .select()
    .from(tsgBoxProcess)
    .where(eq(tsgBoxProcess.sessionId, input.sessionId));

  if (boxes.length === 0) throw new ServiceError("SESSION_EMPTY", "Sesi tidak punya boks.");
  if (boxes.some((b) => b.completedAt)) {
    throw new ServiceError("SESSION_HAS_COMPLETED_BOX", "Ada boks sesi yang sudah ditimbang.");
  }

  // Shift + kode mesin untuk kode batch
  const [shift] = await db
    .select({ id: shiftReport.id, machineId: shiftReport.machineId })
    .from(shiftReport)
    .where(eq(shiftReport.id, session.shiftReportId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");

  const [m] = await db
    .select({ code: machine.code })
    .from(machine)
    .where(eq(machine.id, shift.machineId))
    .limit(1);

  const machineCode = m?.code ?? "MKR00";

  // Bagi total proporsional bobot TSG tiap boks
  const totalTsg = boxes.reduce((s, b) => s + Number(b.tsgWeightKg), 0);
  if (totalTsg <= 0) {
    throw new ServiceError("BOX_WEIGHT_INVALID", "Data berat TSG boks tidak valid (0 atau kosong).");
  }

  const rounded = splitBatanganProportional(
    input.totalBatanganKg,
    boxes.map((b) => Number(b.tsgWeightKg))
  );

  const { yieldMin, yieldMax } = await getYieldTemplateForShift(session.shiftReportId);

  // Jejak makloon (0031, docs/26 §2.2): kalau SATU boks sesi berasal dari TSG
  // makloon, batch batangan ikut ditandai isMakloonTsg + pemesan + produk
  // pesanan + order — terwariskan ke produk akhir.
  const inventoryIds = boxes.map((b) => b.inventoryBoxId).filter((id): id is string => !!id);
  let isMakloonTsg = false;
  let makloonCustomer: string | null = null;
  let makloonTarget: string | null = null;
  let makloonOrderId: string | null = null;
  if (inventoryIds.length > 0) {
    const makloonRows = await db
      .select({
        isMakloon: tsgInventory.isMakloon,
        makloonCustomer: tsgInventory.makloonCustomer,
        makloonTarget: tsgInventory.makloonTarget,
        makloonOrderId: tsgInventory.makloonOrderId,
      })
      .from(tsgInventory)
      .where(and(inArray(tsgInventory.id, inventoryIds), eq(tsgInventory.isMakloon, true)))
      .limit(1);
    if (makloonRows.length > 0) {
      isMakloonTsg = true;
      makloonCustomer = makloonRows[0]!.makloonCustomer ?? null;
      makloonTarget = makloonRows[0]!.makloonTarget ?? null;
      makloonOrderId = makloonRows[0]!.makloonOrderId ?? null;
    }
  }

  // Kode batch: btc_MKR01_20260814_03 (urutan per hari per mesin)
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `btc_${machineCode}_${datePart}_`;
  const existing = await db
    .select({ code: batch.code })
    .from(batch)
    .where(sql`${batch.code} LIKE ${prefix + "%"}`);
  const seq = String(existing.length + 1).padStart(2, "0");
  const batchCode = `${prefix}${seq}`;

  const result = await db.transaction(async (tx) => {
    const [createdBatch] = await tx
      .insert(batch)
      .values({
        shiftReportId: session.shiftReportId,
        plantId: session.plantId,
        machineId: shift.machineId,
        code: batchCode,
        batanganKg: String(input.totalBatanganKg),
        isMakloonTsg,
        makloonCustomer,
        makloonTarget,
        makloonOrderId,
      })
      .returning();

    // Complete semua boks dengan pembagian proporsional
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      const out = rounded[i]!;
      const yieldPct = calculateYieldPct(out, Number(b.tsgWeightKg));
      await tx
        .update(tsgBoxProcess)
        .set({
          outputWeightKg: String(out),
          yieldPct: String(yieldPct),
          completedAt: new Date(),
        })
        .where(eq(tsgBoxProcess.id, b.id));
    }

    await tx
      .update(tsgBoxSession)
      .set({
        status: "WEIGHED",
        batchId: createdBatch!.id,
        totalBatanganKg: String(input.totalBatanganKg),
        weighedAt: new Date(),
      })
      .where(eq(tsgBoxSession.id, session.id));

    return createdBatch;
  });

  const boxResults = boxes.map((b, i) => {
    const out = rounded[i]!;
    const yieldPct = calculateYieldPct(out, Number(b.tsgWeightKg));
    return {
      boxId: b.id,
      boxNumber: b.boxNumber,
      outputWeightKg: out,
      yieldPct,
      indicator: getYieldIndicator(yieldPct, { min: yieldMin, max: yieldMax }),
    };
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "shift.box.weigh_session",
    entityTable: "tsg_box_session",
    entityId: session.id,
    before: { status: "OPEN" },
    after: { status: "WEIGHED", batchCode, totalBatanganKg: input.totalBatanganKg, boxCount: boxes.length },
  });

  return {
    sessionId: session.id,
    batchId: result!.id,
    batchCode,
    totalBatanganKg: input.totalBatanganKg,
    boxes: boxResults,
    yieldRange: `${yieldMin}-${yieldMax}%`,
  };
}

// =============================================================================
// Log Consumption
// =============================================================================

export async function logConsumption(input: ConsumptionInput) {
  if (!input.boxId && !input.sessionId) {
    throw new ServiceError("INVALID_TARGET", "Pilih boks atau sesi untuk mencatat pemakaian.");
  }

  // Sesi → plantId diambil dari sesi
  let plantId = input.plantId;
  if (input.sessionId) {
    const [session] = await db
      .select({ plantId: tsgBoxSession.plantId })
      .from(tsgBoxSession)
      .where(eq(tsgBoxSession.id, input.sessionId))
      .limit(1);
    if (!session) throw new ServiceError("SESSION_NOT_FOUND", "Sesi boks tidak ditemukan.");
    plantId = session.plantId;
  }

  const [consumption] = await db
    .insert(tsgBoxConsumption)
    .values({
      tsgBoxId: input.boxId ?? null,
      sessionId: input.sessionId ?? null,
      plantId,
      consumableItemId: input.consumableItemId,
      quantity: String(input.quantity),
      loggedBy: input.loggedBy,
      note: input.note ?? null,
    })
    .returning();

  return consumption;
}

// =============================================================================
// Log Downtime
// =============================================================================

export async function logDowntime(input: DowntimeInput) {
  if (input.durationMinutes <= 0 || input.durationMinutes > 720) {
    throw new ServiceError("INVALID_DURATION", "Durasi downtime harus 1-720 menit.");
  }

  const [log] = await db
    .insert(downtimeLog)
    .values({
      shiftReportId: input.shiftReportId,
      plantId: input.plantId,
      category: input.category,
      durationMinutes: input.durationMinutes,
      linkedBoxId: input.linkedBoxId ?? null,
      sessionId: input.sessionId ?? null,
      description: input.description ?? null,
      loggedBy: input.loggedBy,
    })
    .returning();

  return log;
}

// =============================================================================
// Log Maintenance
// =============================================================================

export async function logMaintenance(input: MaintenanceInput) {
  const [log] = await db
    .insert(maintenanceEvent)
    .values({
      shiftReportId: input.shiftReportId,
      plantId: input.plantId,
      sparepartId: input.sparepartId,
      quantity: input.quantity,
      linkedBoxId: input.linkedBoxId ?? null,
      sessionId: input.sessionId ?? null,
      note: input.note ?? null,
      loggedBy: input.loggedBy,
    })
    .returning();

  return log;
}

// =============================================================================
// HLP Pack — catat hasil packing
// =============================================================================

export async function hlpPackInput(input: HlpPackInput) {
  // Guard: batch hanya boleh dicatat packing SEKALI. Double submit
  // menggandakan total pack (bug ditemukan saat uji alur HLP 24 Agu 2026).
  const [existing] = await db
    .select({ id: hlpPack.id })
    .from(hlpPack)
    .where(eq(hlpPack.batchId, input.batchId))
    .limit(1);

  if (existing) {
    throw new ServiceError(
      "HLP_BATCH_ALREADY_PACKED",
      "Batch ini sudah dicatat hasil packingnya. Pilih batch lain.",
      { batchId: input.batchId }
    );
  }

  const rejectPacks = input.rejectPacks ?? 0;
  const rejectReason = input.rejectReason?.trim() || null;

  // Reject pack dihitung sebagai batangan (docs/23 §4.1)
  const totalBatang = calculateTotalBatang(
    input.packsLolos,
    input.isiPerPack,
    input.rejectBatangan,
    rejectPacks
  );

  // Ambil batch untuk dapatkan batanganKg
  const [b] = await db
    .select()
    .from(batch)
    .where(eq(batch.id, input.batchId))
    .limit(1);

  let beratPerBatangGram: number | null = null;

  if (b) {
    beratPerBatangGram = calculateBeratPerBatangGram(
      Number(b.batanganKg),
      input.packsLolos,
      input.isiPerPack,
      input.rejectBatangan,
      rejectPacks
    );
  }

  // Sesi HLP OPEN untuk mesin ini WAJIB (keputusan 3 Sep 2026) — packing
  // hanya boleh dicatat dalam sesi terbuka, lalu otomatis menempel (docs/23 §2.2).
  let hlpShiftId: string | null = null;
  if (input.hlpShiftId !== undefined) {
    hlpShiftId = input.hlpShiftId;
  } else {
    const [openShift] = await db
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
    if (!openShift) {
      throw new ServiceError(
        "HLP_SESSION_REQUIRED",
        "Buka sesi HLP untuk mesin ini dulu sebelum mencatat packing."
      );
    }
    hlpShiftId = openShift.id;
  }

  const [pack] = await db
    .insert(hlpPack)
    .values({
      batchId: input.batchId,
      plantId: input.plantId,
      hlpMachineId: input.hlpMachineId,
      hlpShiftId,
      packsLolos: input.packsLolos,
      isiPerPack: input.isiPerPack,
      rejectBatangan: input.rejectBatangan,
      rejectPacks,
      rejectReason,
      totalBatang,
      beratPerBatangGram: beratPerBatangGram ? String(beratPerBatangGram) : null,
    })
    .returning();

  // Sink ledger rijekan: reject HLP masuk pool (docs/23 §5.2, docs/26 §3.2)
  // — reject batangan langsung + batangan dalam pack reject. Identitas lot
  // (jenis + asal + order) di-derive dari batch.
  const rejectBatangTotal = rejectPacks * input.isiPerPack + input.rejectBatangan;
  if (rejectBatangTotal > 0) {
    void (async () => {
      const ctx = await deriveRijekanContextFromBatch(input.batchId);
      await addRijekanEntry({
        plantId: input.plantId,
        entryType: "IN_HLP_REJECT",
        quantity: rejectBatangTotal,
        unit: "BATANG",
        refId: pack!.id,
        note: rejectReason ?? undefined,
        tsgType: ctx.tsgType,
        origin: ctx.origin,
        makloonOrderId: ctx.makloonOrderId,
      });
    })();
  }

  // Ambang reject → push FCM PM + supervisor (docs/23 §4.4, default 5%)
  const rejectRatio = totalBatang > 0 ? rejectBatangTotal / totalBatang : 0;
  if (rejectRatio > HLP_REJECT_THRESHOLD_PCT) {
    void notifyHlpRejectHigh({
      plantId: input.plantId,
      batchCode: b?.code ?? pack!.batchId.substring(0, 8),
      ratioPct: Math.round(rejectRatio * 1000) / 10,
    });
  }

  return { ...pack, beratPerBatangGram };
}

// =============================================================================
// Sisa Batch — ringkasan konteks pekerjaan saat ganti kru / tutup sesi
// (docs/23 §2.4). Kalkulasi server-side (konvensi #5).
// =============================================================================

export async function getBatchSisaSummary(batchId: string) {
  const [b] = await db
    .select({ id: batch.id, code: batch.code, batanganKg: batch.batanganKg })
    .from(batch)
    .where(eq(batch.id, batchId))
    .limit(1);
  if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan.");

  const aggRows = await db
    .select({
      totalBatangPakai: sql<number>`COALESCE(SUM(${hlpPack.totalBatang}), 0)::int`.mapWith(Number),
      packsLolos: sql<number>`COALESCE(SUM(${hlpPack.packsLolos}), 0)::int`.mapWith(Number),
      rejectPacks: sql<number>`COALESCE(SUM(${hlpPack.rejectPacks}), 0)::int`.mapWith(Number),
      rejectBatangan: sql<number>`COALESCE(SUM(${hlpPack.rejectBatangan}), 0)::int`.mapWith(Number),
    })
    .from(hlpPack)
    .where(eq(hlpPack.batchId, batchId));
  const agg = aggRows[0] ?? { totalBatangPakai: 0, packsLolos: 0, rejectPacks: 0, rejectBatangan: 0 };

  const [lastPack] = await db
    .select({ beratPerBatangGram: hlpPack.beratPerBatangGram })
    .from(hlpPack)
    .where(eq(hlpPack.batchId, batchId))
    .orderBy(desc(hlpPack.packedAt))
    .limit(1);

  const beratPerBatang = lastPack?.beratPerBatangGram != null ? Number(lastPack.beratPerBatangGram) : null;
  const batanganKg = Number(b.batanganKg);
  const kgPakai = beratPerBatang != null
    ? Math.round((agg.totalBatangPakai * beratPerBatang) / 1000 * 100) / 100
    : null;
  // Sisa estimasi dari berat/batang terakhir — presisi mengikuti entry paling baru
  const sisaBatangEst = beratPerBatang != null
    ? Math.max(0, Math.round((batanganKg * 1000) / beratPerBatang) - agg.totalBatangPakai)
    : null;
  const sisaKgEst = beratPerBatang != null
    ? Math.max(0, Math.round((batanganKg - kgPakai!) * 100) / 100)
    : null;

  // Rincian per stage (docs/25 §5.1 — dijawab: rincian per stage).
  // 0032: sisa = sisa TERCATAT operator di event stage berikutnya (Σ sisa_qty)
  // bila ada; kalau tidak (data lama), fallback output stage − input berikutnya.
  // BAL = output BAL. Lalu − dialokasikan ke karton.
  const stageRows = await db
    .select({
      stage: batchStageEvent.stage,
      inputQty: sql<number>`COALESCE(SUM(${batchStageEvent.inputQty}::numeric), 0)`.mapWith(Number),
      outputQty: sql<number>`COALESCE(SUM(${batchStageEvent.outputQty}::numeric), 0)`.mapWith(Number),
      rejectQty: sql<number>`COALESCE(SUM(${batchStageEvent.rejectQty}::numeric), 0)`.mapWith(Number),
      sisaQty: sql<number>`COALESCE(SUM(${batchStageEvent.sisaQty}::numeric), 0)`.mapWith(Number),
      sisaCount: sql<number>`COUNT(${batchStageEvent.sisaQty})`.mapWith(Number),
    })
    .from(batchStageEvent)
    .where(eq(batchStageEvent.batchId, batchId))
    .groupBy(batchStageEvent.stage);
  const byStage = new Map(stageRows.map((r) => [r.stage, r]));
  const total = (stage: string, field: "inputQty" | "outputQty" | "rejectQty") =>
    byStage.get(stage)?.[field] ?? 0;

  // Sudah dialokasikan ke karton (source STAGE) per stage — 0029
  const allocRows = await db
    .select({
      stage: cartonContent.stage,
      total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)`.mapWith(Number),
    })
    .from(cartonContent)
    .where(and(eq(cartonContent.batchId, batchId), isNotNull(cartonContent.stage)))
    .groupBy(cartonContent.stage);
  const allocatedByStage = new Map(allocRows.map((r) => [r.stage!, r.total]));

  const stageBreakdown = (["WR", "SLOP", "BAL"] as const)
    .filter((s) => byStage.has(s))
    .map((s) => {
      const next = s === "WR" ? "SLOP" : s === "SLOP" ? "BAL" : null;
      const allocated = allocatedByStage.get(s) ?? 0;
      let sisa: number;
      if (next != null) {
        const nextRows = byStage.get(next);
        sisa =
          nextRows && Number(nextRows.sisaCount) > 0
            ? Number(nextRows.sisaQty)
            : total(s, "outputQty") - total(next, "inputQty");
      } else {
        sisa = total(s, "outputQty");
      }
      sisa = Math.max(0, sisa - allocated);
      return {
        stage: s,
        inputQty: total(s, "inputQty"),
        outputQty: total(s, "outputQty"),
        rejectQty: total(s, "rejectQty"),
        allocatedToCarton: allocated,
        sisaQty: Math.round(sisa * 100) / 100,
      };
    });

  return {
    batchId,
    code: b.code,
    batanganKg,
    packsLolos: agg.packsLolos,
    rejectPacks: agg.rejectPacks,
    rejectBatangan: agg.rejectBatangan,
    totalBatangPakai: agg.totalBatangPakai,
    beratPerBatangGramTerakhir: beratPerBatang,
    kgPakai,
    sisaBatangEst,
    sisaKgEst,
    stageBreakdown,
  };
}
