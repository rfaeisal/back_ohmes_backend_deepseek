"use client";

import { useState } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MOCK_KPI = {
  plantId: "PLT-MLG-01",
  date: "2026-08-10",
  shifts: { total: 2, byStatus: { RUNNING: 0, COMPLETED: 0, APPROVED: 2 } },
  production: { tsgTotalKg: 1420.5, batanganTotalKg: 1580.2, yieldPct: 111.24 },
  waste: { MENIR: 1.85, RIJEKAN: 22.10, DEBU_KASAR: 25.60, DEBU_HALUS: 68.30 },
  topDowntime: [
    { category: "GANTI_MATERIAL", totalMinutes: 45 },
    { category: "ISTIRAHAT_IZIN", totalMinutes: 30 },
  ],
};

export default function DashboardPage() {
  const [kpi] = useState(MOCK_KPI);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-lg text-gray-500 mt-1">
          Pabrik Malang 1 · {kpi.date}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-500">Total Shift</p>
          <p className="text-3xl font-bold text-gray-900">{kpi.shifts.total}</p>
          <p className="text-sm text-gray-400">{kpi.shifts.byStatus.APPROVED} APPROVED</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">TSG Diproses</p>
          <p className="text-3xl font-bold text-blue-700">{kpi.production.tsgTotalKg.toLocaleString()} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Batangan Dihasilkan</p>
          <p className="text-3xl font-bold text-primary-700">{kpi.production.batanganTotalKg.toLocaleString()} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Yield Rata-rata</p>
          <p className="text-3xl font-bold text-green-700">{kpi.production.yieldPct}%</p>
        </Card>
      </div>

      {/* Waste & Downtime */}
      <div className="grid grid-cols-2 gap-6">
        {/* Waste */}
        <Card>
          <CardTitle>Waste 4 Kategori</CardTitle>
          <div className="mt-4 space-y-3">
            {Object.entries(kpi.waste).map(([cat, kg]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{cat.replace("_", " ")}</span>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{kg} kg</span>
                  <div className="w-32 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full"
                      style={{ width: `${Math.min((kg / 100) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-3 flex justify-between">
              <span className="font-bold text-gray-900">Total</span>
              <span className="text-xl font-bold text-red-700">
                {Object.values(kpi.waste).reduce((a, b) => a + b, 0)} kg
              </span>
            </div>
          </div>
        </Card>

        {/* Downtime */}
        <Card>
          <CardTitle>Top Downtime</CardTitle>
          <div className="mt-4 space-y-3">
            {kpi.topDowntime.map((d) => (
              <div key={d.category} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {d.category.replace(/_/g, " ")}
                </span>
                <Badge variant="warning">{d.totalMinutes} menit</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
