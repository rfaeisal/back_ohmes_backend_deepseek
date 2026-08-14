// =============================================================================
// Kalkulasi Produksi — Semua server-side, TIDAK PERNAH client-side
// =============================================================================

export interface YieldRange {
  min: number;
  max: number;
}

export type YieldIndicator = "NORMAL" | "WARNING";

// =============================================================================
// Yield Boks
// =============================================================================

/**
 * yieldPct = (outputWeightKg / tsgWeightKg) × 100
 */
export function calculateYieldPct(
  outputWeightKg: number,
  tsgWeightKg: number
): number {
  if (tsgWeightKg <= 0) {
    throw new Error("DIVIDE_BY_ZERO: tsgWeightKg must be > 0");
  }
  return Math.round((outputWeightKg / tsgWeightKg) * 10000) / 100; // 2 desimal
}

/**
 * Menentukan apakah yield NORMAL atau WARNING berdasarkan MachineTemplate range
 */
export function getYieldIndicator(
  yieldPct: number,
  range: YieldRange
): YieldIndicator {
  return yieldPct >= range.min && yieldPct <= range.max ? "NORMAL" : "WARNING";
}

// =============================================================================
// Yield Shift (dengan handoff support)
// =============================================================================

export interface ShiftYieldInput {
  boxes: Array<{ outputWeightKg: number; tsgWeightKg: number }>;
  handoffBatanganSementaraKg?: number; // dari shiftHandoff yg di-claim
}

/**
 * Yield shift tanpa handoff: sum(output) / sum(tsg) × 100
 */
export function calculateShiftYield(input: ShiftYieldInput): number {
  const totalOutput = input.boxes.reduce(
    (sum, b) => sum + b.outputWeightKg,
    0
  );
  const totalTsg = input.boxes.reduce((sum, b) => sum + b.tsgWeightKg, 0);

  if (totalTsg <= 0) {
    return 0;
  }

  return Math.round((totalOutput / totalTsg) * 10000) / 100;
}

// =============================================================================
// Berat per Batang (HLP)
// =============================================================================

/**
 * totalBatang = packsLolos × isiPerPack + rejectBatangan
 * beratPerBatang = (batanganKgBatch × 1000) / totalBatang
 */
export function calculateBeratPerBatangGram(
  batanganKgBatch: number,
  packsLolos: number,
  isiPerPack: number,
  rejectBatangan: number
): number {
  const totalBatang = packsLolos * isiPerPack + rejectBatangan;

  if (totalBatang <= 0) {
    throw new Error("DIVIDE_BY_ZERO: totalBatang must be > 0");
  }

  // Batangan dalam kg, konversi ke gram / batang
  return Math.round((batanganKgBatch * 1000 / totalBatang) * 1000) / 1000; // 3 desimal
}

export function calculateTotalBatang(
  packsLolos: number,
  isiPerPack: number,
  rejectBatangan: number
): number {
  return packsLolos * isiPerPack + rejectBatangan;
}

// =============================================================================
// Waste Total per Shift
// =============================================================================

export interface WasteItem {
  kg: number;
}

export function calculateWasteTotalKg(wastes: WasteItem[]): number {
  return wastes.reduce((sum, w) => sum + w.kg, 0);
}

export function calculateWasteRatio(
  wasteTotalKg: number,
  tsgTotalShift: number
): number {
  if (tsgTotalShift <= 0) {
    return 0;
  }
  return Math.round((wasteTotalKg / tsgTotalShift) * 10000) / 100;
}

// =============================================================================
// Inventory Age
// =============================================================================

export function calculateInventoryAgeInDays(createdAt: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getInventoryAgeIndicator(
  ageInDays: number
): "NORMAL" | "CAUTION" | "ALERT" {
  if (ageInDays > 30) return "ALERT";
  if (ageInDays > 14) return "CAUTION";
  return "NORMAL";
}

// =============================================================================
// Sesi Multi-Boks — pembagian berat batangan kolektif
// =============================================================================
// Total batangan dibagi proporsional bobot TSG tiap boks (2 desimal).
// Sisa pembulatan diserap boks terakhir supaya jumlah bagian = total.

export function splitBatanganProportional(
  totalKg: number,
  tsgWeightsKg: number[]
): number[] {
  if (tsgWeightsKg.length === 0) return [];
  const totalTsg = tsgWeightsKg.reduce((s, w) => s + w, 0);
  if (totalTsg <= 0) return tsgWeightsKg.map(() => 0);

  const rounded = tsgWeightsKg.map((w) =>
    Math.round(((totalKg * w) / totalTsg) * 100) / 100
  );
  const sum = Math.round(rounded.reduce((s, v) => s + v, 0) * 100) / 100;
  const diff = Math.round((totalKg - sum) * 100) / 100;
  rounded[rounded.length - 1] =
    Math.round((rounded[rounded.length - 1]! + diff) * 100) / 100;
  return rounded;
}
