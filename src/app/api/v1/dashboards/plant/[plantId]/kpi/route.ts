// GET /api/v1/dashboards/plant/:plantId/kpi — KPI harian per pabrik
import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftReport, shiftWaste, downtimeLog, tsgBoxProcess } from "@/db/schema";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ plantId: string }> }) => {
    const { plantId } = await params;
    const today = new Date().toISOString().slice(0, 10);

    // Total shifts today
    const shifts = await db
      .select({ id: shiftReport.id, status: shiftReport.status })
      .from(shiftReport)
      .where(and(eq(shiftReport.plantId, plantId), eq(shiftReport.reportDate, today)));

    const total = shifts.length;
    const byStatus = {
      RUNNING: shifts.filter((s) => s.status === "RUNNING").length,
      COMPLETED: shifts.filter((s) => s.status === "COMPLETED").length,
      APPROVED: shifts.filter((s) => s.status === "APPROVED").length,
    };

    // Production summary — agregat dari tsg_box_process hari ini
    const [prodAgg] = await db
      .select({
        tsgTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
        outputTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
        boxes: sql<number>`CAST(COUNT(${tsgBoxProcess.id}) AS INTEGER)`.mapWith(Number),
      })
      .from(tsgBoxProcess)
      .innerJoin(shiftReport, sql`${tsgBoxProcess.shiftReportId} = ${shiftReport.id}`)
      .where(and(eq(shiftReport.plantId, plantId), eq(shiftReport.reportDate, today)));

    const tsgTotal = prodAgg?.tsgTotal ?? 0;
    const outputTotal = prodAgg?.outputTotal ?? 0;
    const production = {
      tsgTotalKg: Math.round(tsgTotal * 100) / 100,
      batanganTotalKg: Math.round(outputTotal * 100) / 100,
      yieldPct: tsgTotal > 0 ? Math.round((outputTotal / tsgTotal) * 10000) / 100 : 0,
      boxes: prodAgg?.boxes ?? 0,
    };

    // Waste summary
    const wastes = await db
      .select({
        category: shiftWaste.category,
        totalKg: sql<number>`COALESCE(SUM(${shiftWaste.kg}::decimal), 0)`.mapWith(Number),
      })
      .from(shiftWaste)
      .innerJoin(shiftReport, eq(shiftWaste.shiftReportId, shiftReport.id))
      .where(and(eq(shiftReport.plantId, plantId), eq(shiftReport.reportDate, today)))
      .groupBy(shiftWaste.category);

    const waste = {
      MENIR: 0,
      RIJEKAN: 0,
      DEBU_KASAR: 0,
      DEBU_HALUS: 0,
    };
    for (const w of wastes) {
      if (w.category in waste) {
        waste[w.category as keyof typeof waste] = w.totalKg;
      }
    }

    // Top downtime
    const topDowntime = await db
      .select({
        category: downtimeLog.category,
        totalMinutes: sql<number>`COALESCE(SUM(${downtimeLog.durationMinutes}), 0)`.mapWith(Number),
      })
      .from(downtimeLog)
      .innerJoin(shiftReport, eq(downtimeLog.shiftReportId, shiftReport.id))
      .where(and(eq(shiftReport.plantId, plantId), eq(shiftReport.reportDate, today)))
      .groupBy(downtimeLog.category)
      .orderBy(sql`COALESCE(SUM(${downtimeLog.durationMinutes}), 0) DESC`)
      .limit(5);

    return NextResponse.json(
      {
        plantId,
        date: today,
        shifts: { total, byStatus },
        production,
        waste,
        topDowntime,
      },
      { status: 200 }
    );
  },
  { requiredPermission: "dashboard.plant.view" }
);
