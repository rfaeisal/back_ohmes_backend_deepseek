"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect } from "react";
import { Card, CardTitle } from "@/components/ui/card";


export default function DashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Plant ID dari scope JWT (bukan hardcoded)
        let plantId = "";
        const t = localStorage.getItem("accessToken");
        if (t) {
          const payload = JSON.parse(atob(t.split(".")[1]!));
          plantId = payload.plantIds?.[0] ?? "";
        }
        if (plantId) setKpi(await apiFetch(`/dashboards/plant/${plantId}/kpi`));
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat dashboard...</div>;
  if (!kpi) return <div className="p-8 text-center text-gray-400">Belum ada data. Jalankan produksi dulu.</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6"><h1 className="text-3xl font-bold text-gray-900">Dashboard</h1><p className="text-lg text-gray-500">KPI Pabrik · {kpi.date}</p></div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Total Shift</p><p className="text-3xl font-bold">{kpi.shifts?.total ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">TSG Diproses</p><p className="text-3xl font-bold text-blue-700">{kpi.production?.tsgTotalKg ?? 0} kg</p></Card>
        <Card><p className="text-xs text-gray-500">Batangan</p><p className="text-3xl font-bold text-primary-700">{kpi.production?.batanganTotalKg ?? 0} kg</p></Card>
        <Card><p className="text-xs text-gray-500">Yield</p><p className="text-3xl font-bold text-green-700">{kpi.production?.yieldPct ?? 0}%</p></Card>
      </div>
      <Card>
        <CardTitle>Waste</CardTitle>
        <div className="mt-4 space-y-2">
          {Object.entries(kpi.waste ?? {}).map(([cat, kg]: any) => (
            <div key={cat} className="flex justify-between"><span>{cat.replace("_"," ")}</span><span className="font-bold">{kg} kg</span></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
