"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) return null;
  return res.json();
}

export default function AreaDashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Coba fetch area dashboard — gunakan region pertama yg available
      const data = await apiFetch("/dashboards/hq/kpi");
      setKpi(data);
    } catch { setKpi(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat dashboard area...</div>;
  if (!kpi) return <div className="p-8 text-center text-gray-500">Tidak ada data. Pastikan sudah ada shift APPROVED.</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Koordinator Area</h1>
      <p className="text-gray-500 mb-6">Rollup KPI lintas pabrik — {kpi.date}</p>

      {kpi.regions?.map((r: any) => (
        <div key={r.region?.id} className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{r.region?.name ?? "Area"} ({r.region?.code})</h2>

          {r.summary && (
            <div className="grid grid-cols-5 gap-4 mb-4">
              {[
                { label: "Total Pabrik", value: r.summary.totalPlants },
                { label: "Pabrik Aktif", value: r.summary.activePlants, color: "text-green-700" },
                { label: "Total Shift", value: r.summary.totalShifts },
                { label: "Approved", value: r.summary.approvedShifts, color: "text-green-700" },
                { label: "Pending Approval", value: r.summary.pendingApproval, color: "text-yellow-700" },
              ].map((s) => (
                <Card key={s.label}>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-3xl font-bold ${s.color ?? "text-gray-900"}`}>{s.value}</p>
                </Card>
              ))}
            </div>
          )}

          {r.plants?.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {r.plants.map((p: any) => (
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
      ))}
    </div>
  );
}
