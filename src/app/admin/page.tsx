import { sql } from "drizzle-orm";
import db from "@/db";
import { Card } from "@/components/ui/card";
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
    </div>
  );
}
