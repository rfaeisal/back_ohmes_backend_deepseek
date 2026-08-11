// =============================================================================
// Box Service — Business Logic Boks TSG & Production Events
// =============================================================================

import { eq, and, isNull, sql } from "drizzle-orm";
import db from "@/db";
import {
  shiftReport,
  tsgBoxProcess,
  tsgBoxConsumption,
  downtimeLog,
  maintenanceEvent,
  tsgInventory,
  batch,
  hlpPack,
} from "@/db/schema";
import { machineTemplate } from "@/db/schema/master-product";
import { calculateYieldPct, getYieldIndicator, calculateBeratPerBatangGram, calculateTotalBatang } from "@/lib/calc";
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
  boxId: string;
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
  description?: string;
  loggedBy: string;
}

export interface MaintenanceInput {
  shiftReportId: string;
  plantId: string;
  sparepartId: string;
  quantity: number;
  linkedBoxId?: string;
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
    const { tsgReceivingBox } = await import("@/db/schema/wms-inbound");
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

  // Dapatkan machine template untuk yield range
  const [shift] = await db
    .select({ productId: shiftReport.productId })
    .from(shiftReport)
    .where(eq(shiftReport.id, box.shiftReportId))
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

  // Kalkulasi yield
  const yieldPct = calculateYieldPct(
    input.outputWeightKg,
    Number(box.tsgWeightKg)
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
// Log Consumption
// =============================================================================

export async function logConsumption(input: ConsumptionInput) {
  const [consumption] = await db
    .insert(tsgBoxConsumption)
    .values({
      tsgBoxId: input.boxId,
      plantId: input.plantId,
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
