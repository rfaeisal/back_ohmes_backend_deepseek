// =============================================================================
// HQ Analytics Service — Aggregasi lintas pabrik untuk HQ dashboard
// =============================================================================

import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import db from "@/db";
import { shiftReport, shiftWaste, downtimeLog, tsgBoxProcess } from "@/db/schema";
import { tsgInventory } from "@/db/schema/wms-inbound";

// =============================================================================
// Yield Trend — per produk per pabrik per bulan
// =============================================================================

export async function getYieldTrend(params: {
  plantId?: string;
  productId?: string;
  months?: number;
}) {
  const months = params.months ?? 6;
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const conditions = [gte(shiftReport.reportDate, since.toISOString().slice(0, 10))];
  if (params.plantId) conditions.push(eq(shiftReport.plantId, params.plantId));
  if (params.productId) conditions.push(eq(shiftReport.productId, params.productId));

  const boxes = await db
    .select({
      plantId: shiftReport.plantId,
      productId: shiftReport.productId,
      month: sql<string>`TO_CHAR(${shiftReport.reportDate}, 'YYYY-MM')`.mapWith(String),
      tsgTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
      outputTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
      boxCount: sql<number>`COUNT(${tsgBoxProcess.id})`.mapWith(Number),
    })
    .from(tsgBoxProcess)
    .innerJoin(shiftReport, eq(tsgBoxProcess.shiftReportId, shiftReport.id))
    .where(and(...conditions))
    .groupBy(shiftReport.plantId, shiftReport.productId, sql`TO_CHAR(${shiftReport.reportDate}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${shiftReport.reportDate}, 'YYYY-MM')`);

  return boxes.map((b) => ({
    ...b,
    yieldPct: b.tsgTotal > 0
      ? Math.round((b.outputTotal / b.tsgTotal) * 10000) / 100
      : 0,
  }));
}

// =============================================================================
// Waste Benchmark — 4 kategori per pabrik
// =============================================================================

export async function getWasteBenchmark(from: string, to: string) {
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
        gte(shiftReport.reportDate, from),
        lte(shiftReport.reportDate, to)
      )
    )
    .groupBy(shiftReport.plantId, shiftWaste.category);

  // Pivot per plant
  const byPlant: Record<string, Record<string, number>> = {};
  for (const w of wastes) {
    if (!byPlant[w.plantId]) byPlant[w.plantId] = {};
    byPlant[w.plantId]![w.category] = w.totalKg;
  }

  return byPlant;
}

// =============================================================================
// Top Downtime Causes — lintas pabrik
// =============================================================================

export async function getTopDowntimeCauses(from: string, to: string, limit = 10) {
  return db
    .select({
      category: downtimeLog.category,
      plantId: shiftReport.plantId,
      totalMinutes: sql<number>`COALESCE(SUM(${downtimeLog.durationMinutes}), 0)`.mapWith(Number),
      occurrences: sql<number>`COUNT(${downtimeLog.id})`.mapWith(Number),
    })
    .from(downtimeLog)
    .innerJoin(shiftReport, eq(downtimeLog.shiftReportId, shiftReport.id))
    .where(
      and(
        gte(shiftReport.reportDate, from),
        lte(shiftReport.reportDate, to)
      )
    )
    .groupBy(downtimeLog.category, shiftReport.plantId)
    .orderBy(desc(sql`total_minutes`))
    .limit(limit);
}

// =============================================================================
// Inventory Age Panel — boks > 30 hari
// =============================================================================

export async function getInventoryAgePanel() {
  const aging = await db
    .select({
      plantId: tsgInventory.plantId,
      status: tsgInventory.status,
      count: sql<number>`COUNT(*)`.mapWith(Number),
      avgAgeDays: sql<number>`AVG(EXTRACT(DAY FROM NOW() - ${tsgInventory.createdAt}))`.mapWith(Number),
      oldestDays: sql<number>`MAX(EXTRACT(DAY FROM NOW() - ${tsgInventory.createdAt}))`.mapWith(Number),
    })
    .from(tsgInventory)
    .where(eq(tsgInventory.status, "AVAILABLE"))
    .groupBy(tsgInventory.plantId, tsgInventory.status);

  return { aging, alertThreshold: 30 };
}

// =============================================================================
// Consumption Rate — kg TSG per hari per plant per product
// =============================================================================

export async function getConsumptionRate(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rates = await db
    .select({
      plantId: shiftReport.plantId,
      productId: shiftReport.productId,
      reportDate: shiftReport.reportDate,
      tsgUsed: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
    })
    .from(tsgBoxProcess)
    .innerJoin(shiftReport, eq(tsgBoxProcess.shiftReportId, shiftReport.id))
    .where(gte(shiftReport.reportDate, since.toISOString().slice(0, 10)))
    .groupBy(shiftReport.plantId, shiftReport.productId, shiftReport.reportDate)
    .orderBy(shiftReport.reportDate);

  // Aggregate to daily average per plant
  const byPlant: Record<string, { totalTsg: number; days: Set<string> }> = {};
  for (const r of rates) {
    if (!byPlant[r.plantId]) byPlant[r.plantId] = { totalTsg: 0, days: new Set() };
    byPlant[r.plantId]!.totalTsg += r.tsgUsed;
    byPlant[r.plantId]!.days.add(r.reportDate);
  }

  return Object.entries(byPlant).map(([plantId, data]) => ({
    plantId,
    totalTsgKg: Math.round(data.totalTsg * 100) / 100,
    activeDays: data.days.size,
    avgDailyKg: data.days.size > 0
      ? Math.round((data.totalTsg / data.days.size) * 100) / 100
      : 0,
  }));
}
