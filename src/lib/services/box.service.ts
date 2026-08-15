// =============================================================================
// Box Service — Business Logic Boks TSG & Production Events
// =============================================================================

import { eq, and, isNull, sql, inArray } from "drizzle-orm";
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
  tsgReceivingBox,
} from "@/db/schema";
import { machineTemplate, machine } from "@/db/schema/master-product";
import { calculateYieldPct, getYieldIndicator, calculateBeratPerBatangGram, calculateTotalBatang, splitBatanganProportional } from "@/lib/calc";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

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
  const totalBatang = calculateTotalBatang(
    input.packsLolos,
    input.isiPerPack,
    input.rejectBatangan
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
      input.rejectBatangan
    );
  }

  const [pack] = await db
    .insert(hlpPack)
    .values({
      batchId: input.batchId,
      plantId: input.plantId,
      hlpMachineId: input.hlpMachineId,
      packsLolos: input.packsLolos,
      isiPerPack: input.isiPerPack,
      rejectBatangan: input.rejectBatangan,
      totalBatang,
      beratPerBatangGram: beratPerBatangGram ? String(beratPerBatangGram) : null,
    })
    .returning();

  return { ...pack, beratPerBatangGram };
}
