// GET /api/v1/reports/tsg-usage — Laporan agregat penggunaan TSG per shift
import { NextResponse } from "next/server";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import db from "@/db";
import { tsgBoxProcess } from "@/db/schema/box";
import { shiftReport } from "@/db/schema/shift";
import { product, machine } from "@/db/schema/master-product";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (request: Request, _ctx: AuthContext) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const plantId = url.searchParams.get("plantId") ?? undefined;

    // Build conditions
    const conditions = [];
    if (from) conditions.push(gte(shiftReport.reportDate, from));
    if (to) conditions.push(lte(shiftReport.reportDate, to));
    if (plantId) conditions.push(eq(shiftReport.plantId, plantId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Aggregate per shift
    const rows = await db
      .select({
        shiftId: shiftReport.id,
        reportDate: shiftReport.reportDate,
        productName: sql<string>`${shiftReport.productId}`.mapWith(String),
        machineCode: sql<string>`${shiftReport.machineId}`.mapWith(String),
        status: shiftReport.status,
        actualStart: shiftReport.actualStart,
        actualEnd: shiftReport.actualEnd,
        boxesCount: sql<number>`CAST(COUNT(${tsgBoxProcess.id}) AS INTEGER)`.mapWith(Number),
        tsgUsedKg: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
        outputKg: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
      })
      .from(tsgBoxProcess)
      .innerJoin(shiftReport, eq(tsgBoxProcess.shiftReportId, shiftReport.id))
      .where(where)
      .groupBy(shiftReport.id, shiftReport.reportDate, shiftReport.productId, shiftReport.machineId, shiftReport.status, shiftReport.actualStart, shiftReport.actualEnd)
      .orderBy(sql`${shiftReport.reportDate} DESC, ${shiftReport.actualStart} DESC`)
      .limit(200);

    // Enrich with product/machine names via a second query
    const productIds = [...new Set(rows.map(r => r.productName))];
    const machineIds = [...new Set(rows.map(r => r.machineCode))];

    const productMap = new Map<string, string>();
    const machineMap = new Map<string, string>();

    if (productIds.length > 0) {
      const products = await db
        .select({ id: product.id, code: product.code, brand: product.brand })
        .from(product)
        .where(inArray(product.id, productIds));
      for (const p of products) {
        productMap.set(p.id, `${p.brand} ${p.code}`);
      }
    }

    if (machineIds.length > 0) {
      const machines = await db
        .select({ id: machine.id, code: machine.code })
        .from(machine)
        .where(inArray(machine.id, machineIds));
      for (const m of machines) {
        machineMap.set(m.id, m.code);
      }
    }

    // Compute avg yield per shift (server-side, using sums to avoid per-box rounding)
    const shifts = rows.map((r) => {
      const avgYield = r.tsgUsedKg > 0
        ? Math.round((r.outputKg / r.tsgUsedKg) * 10000) / 100
        : 0;
      return {
        shiftId: r.shiftId,
        reportDate: r.reportDate,
        productName: productMap.get(r.productName) ?? r.productName,
        machineCode: machineMap.get(r.machineCode) ?? r.machineCode,
        status: r.status,
        actualStart: r.actualStart,
        actualEnd: r.actualEnd,
        boxesCount: r.boxesCount,
        tsgUsedKg: Math.round(r.tsgUsedKg * 100) / 100,
        outputKg: Math.round(r.outputKg * 100) / 100,
        avgYieldPct: avgYield,
      };
    });

    // Summary
    const totalShifts = shifts.length;
    const totalBoxes = shifts.reduce((s, r) => s + r.boxesCount, 0);
    const totalTsgKg = Math.round(shifts.reduce((s, r) => s + r.tsgUsedKg, 0) * 100) / 100;
    const totalOutputKg = Math.round(shifts.reduce((s, r) => s + r.outputKg, 0) * 100) / 100;
    const avgYieldPct = totalTsgKg > 0
      ? Math.round((totalOutputKg / totalTsgKg) * 10000) / 100
      : 0;

    return NextResponse.json({
      summary: { totalShifts, totalBoxes, totalTsgKg, totalOutputKg, avgYieldPct },
      shifts,
    }, { status: 200 });
  },
  { requiredPermission: "shift.view" }
);
