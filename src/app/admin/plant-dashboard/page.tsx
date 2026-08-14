"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OverviewCharts from "@/components/overview-charts";

export default function PlantDashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [machines, setMachines] = useState<any[]>([]);
  const [runningShifts, setRunningShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let plantId = "";
      const t = localStorage.getItem("accessToken");
      if (t) {
        const payload = JSON.parse(atob(t.split(".")[1]!));
        plantId = payload.plantIds?.[0] ?? "";
      }

      const [kpiData, machinesData, shiftsData] = await Promise.all([
        plantId ? apiFetch(`/dashboards/plant/${plantId}/kpi`) : Promise.resolve(null),
        apiFetch("/machines"),
        apiFetch("/shifts?status=RUNNING&limit=50"),
      ]);
      setKpi(kpiData);
      setMachines(machinesData?.data ?? []);
      setRunningShifts(shiftsData?.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat dashboard pabrik...</div>;

  const runningIds = new Set(runningShifts.map((s) => s.machineId));

  // Yield 7 hari & waste — pakai komponen yang sama dengan overview
  const yieldData = [] as any[];
  const wasteData = ["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"].map((cat) => ({
    category: cat,
    kg: kpi?.waste?.[cat] ?? 0,
  }));

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Pabrik</h1>
      <p className="text-gray-500 mb-6">KPI operasional pabrik · {kpi?.date ?? "-"}</p>

      {/* KPI hari ini */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-500">Shift Hari Ini</p>
          <p className="text-3xl font-bold text-gray-900">{kpi?.shifts?.total ?? 0}</p>
          <p className="text-sm text-gray-400">
            {kpi?.shifts?.byStatus?.RUNNING ?? 0} berjalan · {kpi?.shifts?.byStatus?.APPROVED ?? 0} approved
          </p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Boks Diproses</p>
          <p className="text-3xl font-bold text-indigo-700">{kpi?.production?.boxes ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">TSG Diproses</p>
          <p className="text-3xl font-bold text-blue-700">{kpi?.production?.tsgTotalKg ?? 0} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Hasil Batangan</p>
          <p className="text-3xl font-bold text-primary-700">{kpi?.production?.batanganTotalKg ?? 0} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Yield</p>
          <p className={`text-3xl font-bold ${(kpi?.production?.yieldPct ?? 0) >= 110 && (kpi?.production?.yieldPct ?? 0) <= 114 ? "text-green-700" : "text-red-700"}`}>
            {kpi?.production?.yieldPct ?? 0}%
          </p>
        </Card>
      </div>

      {/* Status mesin */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {machines.length === 0 ? (
          <Card className="col-span-3"><p className="py-4 text-center text-sm text-gray-400">Belum ada mesin terdaftar.</p></Card>
        ) : machines.map((m) => {
          const isRunning = runningIds.has(m.id);
          return (
            <Card key={m.id} highlight={isRunning ? "green" : "none"}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{m.code}</p>
                  <p className="text-sm text-gray-500">{m.name} · {m.type}</p>
                </div>
                <Badge variant={isRunning ? "success" : "neutral"}>{isRunning ? "AKTIF" : "IDLE"}</Badge>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Grafik yield & waste */}
      <OverviewCharts yieldData={yieldData} wasteData={wasteData} />

      {/* Top downtime hari ini */}
      {kpi?.topDowntime?.length > 0 && (
        <Card>
          <CardTitle>Downtime Hari Ini</CardTitle>
          <div className="mt-3 space-y-1">
            {kpi.topDowntime.map((d: any) => (
              <div key={d.category} className="flex justify-between text-sm border-b border-gray-100 py-2 last:border-0">
                <span>{d.category.replace(/_/g, " ")}</span>
                <span className="font-bold text-yellow-700">{d.totalMinutes} menit</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
