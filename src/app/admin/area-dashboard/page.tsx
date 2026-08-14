"use client";
import { apiFetch, getToken } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AreaDashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Region diambil dari scope JWT (activeScopeId) — koordinator di-scope REGION
      const token = getToken();
      let regionId = "";
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]!));
          regionId = payload.activeScopeId ?? "";
        } catch {}
      }
      if (!regionId) {
        // Fallback: cari region pertama yang ada di scope
        const regionsRes = await apiFetch("/regions");
        const regions = regionsRes?.data ?? [];
        if (regions.length > 0) regionId = regions[0].id;
      }
      const data = await apiFetch(`/dashboards/area/${regionId}/kpi?date=${date}`);
      setKpi(data);
    } catch { setKpi(null); } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat dashboard area...</div>;
  if (!kpi) return <div className="p-8 text-center text-gray-500">Tidak ada data. Pastikan sudah ada shift APPROVED.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Koordinator Area</h1>
          <p className="text-gray-500">Rollup KPI lintas pabrik — {kpi.date}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>
      </div>

      {kpi.summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total Pabrik", value: kpi.summary.totalPlants },
            { label: "Pabrik Aktif", value: kpi.summary.activePlants, color: "text-green-700" },
            { label: "Total Shift", value: kpi.summary.totalShifts },
            { label: "Approved", value: kpi.summary.approvedShifts, color: "text-green-700" },
            { label: "Pending Approval", value: kpi.summary.pendingApproval, color: "text-yellow-700" },
          ].map((s) => (
            <Card key={s.label}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color ?? "text-gray-900"}`}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {kpi.plants?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpi.plants.map((p: any) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <CardTitle>{p.name}</CardTitle>
                  <p className="text-sm text-gray-500 font-mono">{p.code}</p>
                </div>
                <Badge variant={p.shifts?.running > 0 ? "success" : "neutral"}>
                  {p.shifts?.running > 0 ? "AKTIF" : "IDLE"}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: "Shift", value: p.shifts?.total ?? 0 },
                  { label: "Approved", value: p.shifts?.approved ?? 0 },
                  { label: "Running", value: p.shifts?.running ?? 0 },
                  { label: "Waste", value: `${(Object.values(p.waste ?? {}) as number[]).reduce((a: number, b: number) => a + b, 0).toFixed(1)}kg` },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="text-lg font-bold">{s.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
