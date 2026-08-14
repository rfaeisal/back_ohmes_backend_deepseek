// =============================================================================
// OEE Calculation Engine
// =============================================================================
// OEE = Availability × Performance × Quality
//
// Availability = (Planned Production Time − Downtime) / Planned Production Time
// Performance  = Actual Output / (Planned Production Time × Ideal Cycle Time)
// Quality     = (Total Output − Reject) / Total Output
// =============================================================================

import { eq, and, gte, lte, sql } from "drizzle-orm";
import db from "@/db";
import { shiftReport, downtimeLog, tsgBoxProcess, hlpPack } from "@/db/schema";
import { shiftTemplate } from "@/db/schema/master-product";

export interface OeeResult {
  shiftId: string;
  plannedMinutes: number;
  downtimeMinutes: number;
  availability: number;  // 0-100%
  performance: number;   // 0-100%
  quality: number;       // 0-100%
  oee: number;           // 0-100%
}

// =============================================================================
// OEE per Shift
// =============================================================================

export async function calculateOeePerShift(shiftId: string): Promise<OeeResult> {
  const [shift] = await db
    .select()
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  if (!shift) throw new Error("SHIFT_NOT_FOUND");

  // Planned Production Time = durasi terjadwal dari template shift.
  // (actual elapsed bisa 0 menit di data test / rounding — template lebih akurat)
  const [tpl] = await db
    .select({ durationMinutes: shiftTemplate.durationMinutes })
    .from(shiftTemplate)
    .where(eq(shiftTemplate.id, shift.shiftTemplateId))
    .limit(1);

  const elapsedMinutes = shift.actualEnd
    ? Math.round((shift.actualEnd.getTime() - shift.actualStart.getTime()) / 60000)
    : 0;
  const plannedMinutes = tpl?.durationMinutes ?? elapsedMinutes;

  // Downtime total
  const downtimes = await db
    .select({
      total: sql<number>`COALESCE(SUM(${downtimeLog.durationMinutes}), 0)`.mapWith(Number),
    })
    .from(downtimeLog)
    .where(eq(downtimeLog.shiftReportId, shiftId));

  const downtimeMinutes = downtimes[0]?.total ?? 0;

  // Availability — clamp 0..100
  const effectiveDowntime = Math.min(downtimeMinutes, plannedMinutes);
  const availability = plannedMinutes > 0
    ? Math.max(0, Math.min(100, Math.round(((plannedMinutes - effectiveDowntime) / plannedMinutes) * 10000) / 100))
    : 100;

  // Box output
  const boxes = await db
    .select({
      totalOutput: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
      totalInput: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
      count: sql<number>`COUNT(${tsgBoxProcess.id})`.mapWith(Number),
    })
    .from(tsgBoxProcess)
    .where(eq(tsgBoxProcess.shiftReportId, shiftId));

  // Performance: kecepatan aktual vs target.
  // Target: 1 boks ideal = 30 menit. Base = waktu aktual shift berjalan
  // (bukan durasi template) — downtime sudah dihitung di Availability.
  const boxCount = boxes[0]?.count ?? 0;
  const elapsedForPerf = elapsedMinutes > 0 ? elapsedMinutes : plannedMinutes;
  const idealCycleMin = 30; // menit ideal per boks
  const performance = boxCount > 0 && elapsedForPerf > 0
    ? Math.min(100, Math.round((idealCycleMin * boxCount / elapsedForPerf) * 10000) / 100)
    : 100;

  // Quality: dari HLP pack reject rate
  const packs = await db
    .select({
      totalReject: sql<number>`COALESCE(SUM(${hlpPack.rejectBatangan}), 0)`.mapWith(Number),
      totalBatang: sql<number>`COALESCE(SUM(${hlpPack.totalBatang}), 0)`.mapWith(Number),
    })
    .from(hlpPack)
    .where(eq(hlpPack.plantId, shift.plantId));

  const quality = packs[0] && packs[0]!.totalBatang > 0
    ? Math.round(((packs[0]!.totalBatang - packs[0]!.totalReject) / packs[0]!.totalBatang) * 10000) / 100
    : 100;

  // OEE
  const oee = Math.round((availability / 100) * (performance / 100) * (quality / 100) * 10000) / 100;

  return {
    shiftId,
    plannedMinutes,
    downtimeMinutes,
    availability,
    performance,
    quality,
    oee,
  };
}

// =============================================================================
// OEE Aggregate — per mesin per periode
// =============================================================================

export async function calculateOeeAggregate(
  plantId: string,
  from: string,
  to: string
) {
  const shifts = await db
    .select({ id: shiftReport.id, machineId: shiftReport.machineId })
    .from(shiftReport)
    .where(
      and(
        eq(shiftReport.plantId, plantId),
        eq(shiftReport.status, "APPROVED"),
        gte(shiftReport.reportDate, from),
        lte(shiftReport.reportDate, to)
      )
    );

  const results: OeeResult[] = [];
  for (const s of shifts) {
    try {
      results.push(await calculateOeePerShift(s.id));
    } catch {
      // Skip shifts with incomplete data
    }
  }

  if (results.length === 0) {
    return { plantId, from, to, shifts: 0, avgOee: 0 };
  }

  const avgOee = Math.round(
    results.reduce((sum, r) => sum + r.oee, 0) / results.length * 100
  ) / 100;

  return {
    plantId,
    from,
    to,
    shifts: results.length,
    avgOee,
    avgAvailability: Math.round(results.reduce((s, r) => s + r.availability, 0) / results.length * 100) / 100,
    avgPerformance: Math.round(results.reduce((s, r) => s + r.performance, 0) / results.length * 100) / 100,
    avgQuality: Math.round(results.reduce((s, r) => s + r.quality, 0) / results.length * 100) / 100,
    details: results,
  };
}
