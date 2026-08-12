import Link from "next/link";
import { sql } from "drizzle-orm";
import db from "@/db";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { plant, user, shiftReport } from "@/db/schema";

export default async function AdminOverview() {
  // Real data dari database
  const plants = await db.select().from(plant);
  const users = await db.select().from(user).where(sql`${user.deletedAt} IS NULL`);
  const today = new Date().toISOString().slice(0, 10);
  const todayShifts = await db.select().from(shiftReport).where(sql`${shiftReport.reportDate}::text = ${today} AND ${shiftReport.deletedAt} IS NULL`);

  const plantInfo = plants.length === 1 ? `${plants[0]!.code}` : `${plants.length} pabrik`;
  const runningToday = todayShifts.filter((s) => s.status === "RUNNING").length;
  const completedToday = todayShifts.filter((s) => s.status === "COMPLETED" || s.status === "APPROVED").length;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
      <p className="text-gray-500 mb-8">Kelola sistem MES + WMS Hummer</p>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Card>
          <p className="text-xs text-gray-500">Pabrik</p>
          <p className="text-3xl font-bold text-gray-900">{plants.length}</p>
          <p className="text-sm text-gray-400">{plantInfo}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">User Aktif</p>
          <p className="text-3xl font-bold text-gray-900">{users.length}</p>
          <p className="text-sm text-gray-400">7 role utama</p>
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

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: "/admin/approvals", title: "Approval Shift", desc: "Supervisor: review & approve shift COMPLETED → LOCKED", icon: "✅" },
          { href: "/admin/area-dashboard", title: "Dashboard Area", desc: "Koordinator: rollup KPI semua pabrik dalam region", icon: "📍" },
          { href: "/admin/analytics", title: "HQ Analytics", desc: "Analyst: yield trend, OEE, waste benchmark, export cukai", icon: "📈" },
          { href: "/admin/corrections", title: "CORRECTION Flow", desc: "Auditor: koreksi shift LOCKED tanpa mengubah data asli", icon: "🔧" },
          { href: "/admin/users", title: "Users & Role", desc: "Admin: kelola user, assignment, 13 role", icon: "👤" },
          { href: "/admin/master-data", title: "Master Data", desc: "Admin: pabrik, mesin, produk, supplier", icon: "⚙️" },
          { href: "/admin/audit", title: "Audit Log", desc: "Admin/SUPERADMIN: immutable trail semua aktivitas", icon: "📋" },
          { href: "/admin/reports/tsg-receiving", title: "Laporan TSG Masuk", desc: "Riwayat penerimaan TSG, filter tanggal & supplier, export CSV", icon: "📋" },
          { href: "/admin/super", title: "SUPERADMIN Tools", desc: "Impersonate, force logout, revoke session, security log", icon: "🔐" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div className="flex items-start gap-4">
                <span className="text-3xl">{item.icon}</span>
                <div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardSubtitle>{item.desc}</CardSubtitle>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Fase Status */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Status Fase</h2>
        <div className="grid grid-cols-7 gap-2">
          {["F0 Foundation", "F1 Pilot", "F2 Rollout", "F3 Mobile+QR", "F4 Analytics", "F5 Outbound", "F6 Distribusi"].map((f) => (
            <Card key={f} highlight="green">
              <div className="text-center">
                <p className="text-lg font-bold text-green-700">✅</p>
                <p className="text-xs font-medium text-gray-700">{f}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
