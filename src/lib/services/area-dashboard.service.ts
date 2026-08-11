// =============================================================================
// Area Dashboard Service — Rollup KPI per Region
// =============================================================================

import { eq, and, sql, inArray } from "drizzle-orm";
import db from "@/db";
import { shiftReport, shiftWaste } from "@/db/schema";
import { region, plant } from "@/db/schema/tenancy";

// =============================================================================
// Get Area KPI — aggregasi semua pabrik dalam satu region
// =============================================================================

export async function getAreaKpi(regionId: string, date?: string) {
  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  // Get all plants in region
  const plants = await db
    .select({ id: plant.id, code: plant.code, name: plant.name })
    .from(plant)
    .where(eq(plant.regionId, regionId));

  const plantIds = plants.map((p) => p.id);

  if (plantIds.length === 0) {
    return { regionId, date: reportDate, plants: [], summary: null };
  }

  // Shifts today across all plants
  const shifts = await db
    .select({
      id: shiftReport.id,
      plantId: shiftReport.plantId,
      status: shiftReport.status,
    })
    .from(shiftReport)
    .where(
      and(
        inArray(shiftReport.plantId, plantIds),
        eq(shiftReport.reportDate, reportDate)
      )
    );

  const shiftCount = shifts.length;
  const approvedCount = shifts.filter((s) => s.status === "APPROVED").length;
  const completedCount = shifts.filter((s) => s.status === "COMPLETED").length;
  const runningCount = shifts.filter((s) => s.status === "RUNNING").length;

  // Waste per plant
  const wasteByPlant: Record<string, Record<string, number>> = {};
  for (const p of plants) {
    wasteByPlant[p.id] = { MENIR: 0, RIJEKAN: 0, DEBU_KASAR: 0, DEBU_HALUS: 0 };
  }

  const wastes = await db
    .select({
      plantId: shiftReport.plantId,
      category: shiftWaste.category,
      totalKg: sql<number>`COALESCE(SUM(${shiftWaste.kg}::decimal), 0)`.mapWith(Number),
    })
    .from(shiftWaste)
    .innerJoin(shiftReport, eq(shiftWaste.shiftReportId, shiftReport.id))
    .where(
      and(
        inArray(shiftReport.plantId, plantIds),
        eq(shiftReport.reportDate, reportDate)
      )
    )
    .groupBy(shiftReport.plantId, shiftWaste.category);

  for (const w of wastes) {
    if (wasteByPlant[w.plantId]) {
      wasteByPlant[w.plantId]![w.category] = w.totalKg;
    }
  }

  // Per-plant summary
  const plantSummaries = plants.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    shifts: {
      total: shifts.filter((s) => s.plantId === p.id).length,
      approved: shifts.filter((s) => s.plantId === p.id && s.status === "APPROVED").length,
      running: shifts.filter((s) => s.plantId === p.id && s.status === "RUNNING").length,
    },
    waste: wasteByPlant[p.id],
  }));

  return {
    regionId,
    date: reportDate,
    summary: {
      totalPlants: plants.length,
      activePlants: plantSummaries.filter((p) => p.shifts.running > 0).length,
      totalShifts: shiftCount,
      approvedShifts: approvedCount,
      pendingApproval: completedCount,
      runningShifts: runningCount,
    },
    plants: plantSummaries,
  };
}

// =============================================================================
// Get HQ Rollup — all regions
// =============================================================================

export async function getHqRollup(date?: string) {
  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  const regions = await db
    .select({ id: region.id, code: region.code, name: region.name })
    .from(region);

  const result = [];

  for (const r of regions) {
    const kpi = await getAreaKpi(r.id, reportDate);
    result.push({ region: r, ...kpi });
  }

  return { date: reportDate, regions: result };
}
