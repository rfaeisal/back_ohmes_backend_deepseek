// =============================================================================
// Area Dashboard Service — Rollup KPI per Region
// =============================================================================

import { eq, and, sql, inArray } from "drizzle-orm";
import db from "@/db";
import { shiftReport, shiftWaste, tsgBoxProcess, downtimeLog } from "@/db/schema";
import { region, plant } from "@/db/schema/tenancy";

// =============================================================================
// Get Area KPI — aggregasi semua pabrik dalam satu region
// =============================================================================

export async function getAreaKpi(regionId: string, date?: string) {
  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  // GLOBAL scope (zero UUID) → rollup semua pabrik tanpa filter region
  const isGlobal = !regionId || regionId === "00000000-0000-0000-0000-000000000000";

  // Get all plants in region (atau semua pabrik untuk scope GLOBAL)
  const plants = await db
    .select({ id: plant.id, code: plant.code, name: plant.name })
    .from(plant)
    .where(isGlobal ? undefined : eq(plant.regionId, regionId));

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

  // Produksi per plant (yield dari tsg_box_process)
  const prodByPlant: Record<string, { tsgKg: number; outputKg: number; boxes: number; yieldPct: number | null }> = {};
  for (const p of plants) {
    prodByPlant[p.id] = { tsgKg: 0, outputKg: 0, boxes: 0, yieldPct: null };
  }
  const prods = await db
    .select({
      plantId: shiftReport.plantId,
      tsgKg: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
      outputKg: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
      boxes: sql<number>`CAST(COUNT(${tsgBoxProcess.id}) AS INTEGER)`.mapWith(Number),
    })
    .from(tsgBoxProcess)
    .innerJoin(shiftReport, sql`${tsgBoxProcess.shiftReportId} = ${shiftReport.id}`)
    .where(
      and(
        inArray(shiftReport.plantId, plantIds),
        eq(shiftReport.reportDate, reportDate)
      )
    )
    .groupBy(shiftReport.plantId);

  for (const pr of prods) {
    if (prodByPlant[pr.plantId]) {
      prodByPlant[pr.plantId] = {
        tsgKg: pr.tsgKg,
        outputKg: pr.outputKg,
        boxes: pr.boxes,
        yieldPct: pr.tsgKg > 0 ? Math.round((pr.outputKg / pr.tsgKg) * 10000) / 100 : null,
      };
    }
  }

  // Downtime per plant
  const downtimeByPlant: Record<string, number> = {};
  for (const p of plants) downtimeByPlant[p.id] = 0;
  const downtimes = await db
    .select({
      plantId: shiftReport.plantId,
      totalMinutes: sql<number>`COALESCE(SUM(${downtimeLog.durationMinutes}), 0)`.mapWith(Number),
    })
    .from(downtimeLog)
    .innerJoin(shiftReport, sql`${downtimeLog.shiftReportId} = ${shiftReport.id}`)
    .where(
      and(
        inArray(shiftReport.plantId, plantIds),
        eq(shiftReport.reportDate, reportDate)
      )
    )
    .groupBy(shiftReport.plantId);

  for (const d of downtimes) {
    if (downtimeByPlant[d.plantId] !== undefined) downtimeByPlant[d.plantId] = d.totalMinutes;
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
    production: prodByPlant[p.id],
    downtimeMinutes: downtimeByPlant[p.id],
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

// =============================================================================
// Get Area KPI Week — agregat 7 hari dari weekStart
// =============================================================================

export async function getAreaKpiWeek(regionId: string, weekStart: string) {
  const start = new Date(weekStart + "T00:00:00+07:00");
  const daily: any[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const kpi = await getAreaKpi(regionId, dateStr);
    daily.push(kpi);
  }

  // Agregat summary
  const summary = {
    totalPlants: daily[0]?.summary?.totalPlants ?? 0,
    activePlants: daily.reduce((s, k) => s + (k.summary?.activePlants ?? 0), 0),
    totalShifts: daily.reduce((s, k) => s + (k.summary?.totalShifts ?? 0), 0),
    approvedShifts: daily.reduce((s, k) => s + (k.summary?.approvedShifts ?? 0), 0),
    pendingApproval: daily.reduce((s, k) => s + (k.summary?.pendingApproval ?? 0), 0),
    runningShifts: daily.reduce((s, k) => s + (k.summary?.runningShifts ?? 0), 0),
  };

  // Per pabrik: jumlahkan shift, waste, produksi, downtime per hari
  const plants: any[] = [];
  const firstPlants = daily[0]?.plants ?? [];
  for (const p of firstPlants) {
    const shifts = { total: 0, approved: 0, running: 0 };
    const waste: Record<string, number> = { MENIR: 0, RIJEKAN: 0, DEBU_KASAR: 0, DEBU_HALUS: 0 };
    let tsgKg = 0;
    let outputKg = 0;
    let boxes = 0;
    let downtimeMinutes = 0;
    for (const k of daily) {
      const pk = (k.plants ?? []).find((x: any) => x.id === p.id);
      if (pk) {
        shifts.total += pk.shifts?.total ?? 0;
        shifts.approved += pk.shifts?.approved ?? 0;
        shifts.running += pk.shifts?.running ?? 0;
        for (const cat of Object.keys(waste)) {
          waste[cat] += pk.waste?.[cat] ?? 0;
        }
        tsgKg += pk.production?.tsgKg ?? 0;
        outputKg += pk.production?.outputKg ?? 0;
        boxes += pk.production?.boxes ?? 0;
        downtimeMinutes += pk.downtimeMinutes ?? 0;
      }
    }
    plants.push({
      id: p.id,
      code: p.code,
      name: p.name,
      shifts,
      waste,
      production: {
        tsgKg: Math.round(tsgKg * 100) / 100,
        outputKg: Math.round(outputKg * 100) / 100,
        boxes,
        yieldPct: tsgKg > 0 ? Math.round((outputKg / tsgKg) * 10000) / 100 : null,
      },
      downtimeMinutes,
    });
  }

  // Rata-rata per hari
  const activeDays = daily.filter((k) => (k.summary?.totalShifts ?? 0) > 0).length;
  const perDay = {
    avgShiftsPerDay: activeDays > 0 ? Math.round((summary.totalShifts / activeDays) * 100) / 100 : 0,
    activeDays,
  };

  return {
    regionId,
    weekStart,
    weekEnd: daily[6]?.date ?? weekStart,
    summary,
    perDay,
    plants,
  };
}
