import { sql } from "drizzle-orm";
import db from "@/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { plant, user, shiftReport, shiftWaste, tsgBoxProcess } from "@/db/schema";
import { machine } from "@/db/schema/master-product";
import OverviewCharts from "@/components/overview-charts";

// Halaman ini query database langsung — wajib dynamic supaya tidak
// dieksekusi saat `next build` (prerender) yang tidak punya akses DB.
export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  // Real data dari database
  const plants = await db.select().from(plant);
  const users = await db.select().from(user).where(sql`${user.deletedAt} IS NULL`);
  const today = new Date().toISOString().slice(0, 10);
  const todayShifts = await db.select().from(shiftReport).where(sql`${shiftReport.reportDate}::text = ${today} AND ${shiftReport.deletedAt} IS NULL`);

  const plantInfo = plants.length === 1 ? `${plants[0]!.code}` : `${plants.length} pabrik`;
  const runningToday = todayShifts.filter((s) => s.status === "RUNNING").length;
  const completedToday = todayShifts.filter((s) => s.status === "COMPLETED" || s.status === "APPROVED").length;

  // Yield harian 7 hari terakhir
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const yieldRows = await db
    .select({
      reportDate: shiftReport.reportDate,
      tsgTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
      outputTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
      boxes: sql<number>`CAST(COUNT(${tsgBoxProcess.id}) AS INTEGER)`.mapWith(Number),
    })
    .from(tsgBoxProcess)
    .innerJoin(shiftReport, sql`${tsgBoxProcess.shiftReportId} = ${shiftReport.id}`)
    .where(sql`${shiftReport.reportDate}::text >= ${sevenDaysAgo} AND ${shiftReport.deletedAt} IS NULL`)
    .groupBy(shiftReport.reportDate);

  const yieldMap = new Map(yieldRows.map((r) => [r.reportDate, r]));
  const yieldData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const row = yieldMap.get(d);
    yieldData.push({
      date: d,
      yieldPct: row && row.tsgTotal > 0 ? Math.round((row.outputTotal / row.tsgTotal) * 10000) / 100 : null,
      boxes: row?.boxes ?? 0,
    });
  }

  // Waste 7 hari per kategori
  const wasteRows = await db
    .select({
      category: shiftWaste.category,
      kg: sql<number>`COALESCE(SUM(${shiftWaste.kg}::decimal), 0)`.mapWith(Number),
    })
    .from(shiftWaste)
    .innerJoin(shiftReport, sql`${shiftWaste.shiftReportId} = ${shiftReport.id}`)
    .where(sql`${shiftReport.reportDate}::text >= ${sevenDaysAgo} AND ${shiftReport.deletedAt} IS NULL`)
    .groupBy(shiftWaste.category);

  const wasteMap = new Map(wasteRows.map((r) => [r.category, r.kg])) as Map<"MENIR" | "RIJEKAN" | "DEBU_KASAR" | "DEBU_HALUS", number>;
  const wasteData = (["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"] as const).map((cat) => ({
    category: cat,
    kg: Math.round((wasteMap.get(cat) ?? 0) * 100) / 100,
  }));

  // 5 shift terbaru
  const recentShifts = await db
    .select({
      id: shiftReport.id,
      reportDate: shiftReport.reportDate,
      status: shiftReport.status,
      actualStart: shiftReport.actualStart,
      machineCode: machine.code,
    })
    .from(shiftReport)
    .leftJoin(machine, sql`${shiftReport.machineId} = ${machine.id}`)
    .where(sql`${shiftReport.deletedAt} IS NULL`)
    .orderBy(sql`${shiftReport.actualStart} DESC`)
    .limit(5);

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
    if (s === "COMPLETED") return <Badge variant="warning">COMPLETED</Badge>;
    return <Badge variant="info">RUNNING</Badge>;
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
      <p className="text-gray-500 mb-8">Kelola sistem MES + WMS Hummer</p>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-500">Pabrik</p>
          <p className="text-3xl font-bold text-gray-900">{plants.length}</p>
          <p className="text-sm text-gray-400">{plantInfo}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">User Aktif</p>
          <p className="text-3xl font-bold text-gray-900">{users.length}</p>
          <p className="text-sm text-gray-400">13 role ter-cover</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Shift Hari Ini</p>
          <p className="text-3xl font-bold text-gray-900">{todayShifts.length}</p>
          <p className="text-sm text-gray-400">
            {runningToday > 0 ? `${runningToday} berjalan` : completedToday > 0 ? `${completedToday} selesai` : "Belum ada"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">API Endpoints</p>
          <p className="text-3xl font-bold text-gray-900">60+</p>
          <p className="text-sm text-gray-400">REST /api/v1</p>
        </Card>
      </div>

      {/* Grafik interaktif */}
      <OverviewCharts yieldData={yieldData} wasteData={wasteData} />

      {/* Shift terbaru */}
      <Card>
        <p className="text-sm font-semibold text-gray-900 mb-3">Shift Terbaru ({recentShifts.length})</p>
        {recentShifts.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Belum ada shift. Mulai produksi di Tablet Operator.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-2 text-xs font-semibold text-gray-600">Tanggal</th>
                  <th className="pb-2 text-xs font-semibold text-gray-600">Mesin</th>
                  <th className="pb-2 text-xs font-semibold text-gray-600">Mulai</th>
                  <th className="pb-2 text-xs font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-sm font-mono">{s.reportDate}</td>
                    <td className="py-2 text-sm">{s.machineCode ?? "-"}</td>
                    <td className="py-2 text-sm text-gray-500">
                      {s.actualStart ? new Date(s.actualStart).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2">{statusBadge(s.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
