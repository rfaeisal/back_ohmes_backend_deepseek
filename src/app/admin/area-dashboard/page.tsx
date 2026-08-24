"use client";
import { apiFetch, getToken } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AreaDashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weekStart, setWeekStart] = useState(() => {
    // Senin minggu ini
    const now = new Date();
    const day = now.getDay(); // 0 = Minggu
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  });

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Region dari scope JWT — activeScopeId HANYA dipakai kalau scope REGION.
      // Scope COMPANY/GLOBAL (mis. HQ_ANALYST) punya activeScopeId = company,
      // bukan region — kalau dipakai mentah, API dapat region-id palsu → kosong.
      const token = getToken();
      let regionId = "";
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]!));
          if (payload.activeScopeType === "REGION") {
            regionId = payload.activeScopeId ?? "";
          }
        } catch {}
      }
      if (!regionId) {
        // Fallback: cari region pertama yang ada di scope (RLS membatasi
        // daftar region sesuai scope user — COMPANY lihat semua region-nya)
        const regionsRes = await apiFetch("/regions");
        const regions = regionsRes?.data ?? [];
        if (regions.length > 0) regionId = regions[0].id;
      }
      const params = new URLSearchParams();
      if (mode === "week") {
        params.set("mode", "week");
        params.set("weekStart", weekStart);
      } else {
        params.set("date", date);
      }
      const data = await apiFetch(`/dashboards/area/${regionId}/kpi?${params.toString()}`);
      setKpi(data);
    } catch { setKpi(null); } finally { setLoading(false); }
  }, [date, mode, weekStart]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat dashboard area...</div>;
  if (!kpi) return <div className="p-8 text-center text-gray-500">Tidak ada data. Pastikan sudah ada shift APPROVED.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard Koordinator Area</h1>
          <p className="text-gray-500">
            Rollup KPI lintas pabrik — {mode === "week" && kpi.weekStart ? `${kpi.weekStart} → ${kpi.weekEnd}` : kpi.date}
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex gap-2">
            {(["day", "week"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  mode === m ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {m === "day" ? "📅 Hari" : "📆 Minggu"}
              </button>
            ))}
          </div>
          {mode === "day" ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <button onClick={() => shiftWeek(-1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white hover:bg-gray-100">←</button>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Minggu Mulai</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                />
              </div>
              <button onClick={() => shiftWeek(1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white hover:bg-gray-100">→</button>
            </div>
          )}
        </div>
      </div>

      {kpi.summary && kpi.summary.totalShifts === 0 && (
        <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          {mode === "week"
            ? <>📆 Tidak ada shift pada minggu <strong>{kpi.weekStart} → {kpi.weekEnd}</strong>. Pilih minggu lain atau pastikan produksi sudah berjalan.</>
            : <>📅 Tidak ada shift pada tanggal <strong>{kpi.date}</strong>. Pilih tanggal lain atau pastikan produksi sudah berjalan.</>}
        </div>
      )}

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

      {mode === "week" && kpi.perDay && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <p className="text-xs text-gray-500">Rata-rata Shift per Hari Aktif</p>
            <p className="text-3xl font-bold text-primary-700">{kpi.perDay.avgShiftsPerDay}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Hari Aktif (ada shift)</p>
            <p className="text-3xl font-bold text-green-700">{kpi.perDay.activeDays} / 7</p>
          </Card>
        </div>
      )}

      {/* Perbandingan TSG vs Batangan + Waste per pabrik */}
      {kpi.plants?.length > 0 && (() => {
        const maxKg = Math.max(
          0,
          ...kpi.plants.map((p: any) => p.production?.tsgKg ?? 0),
          ...kpi.plants.map((p: any) => p.production?.outputKg ?? 0)
        );
        const maxWaste = Math.max(
          0,
          ...kpi.plants.map((p: any) =>
            (Object.values(p.waste ?? {}) as number[]).reduce((a: number, b: number) => a + b, 0)
          )
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {maxKg > 0 && (
              <Card>
                <CardTitle>TSG Diproses vs Hasil Batangan</CardTitle>
                <p className="text-sm text-gray-500 mb-3">Perbandingan antar pabrik (kg)</p>
                <div className="flex gap-4 mb-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ background: "#2a78d6" }} />
                    TSG Diproses
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ background: "#eb6834" }} />
                    Hasil Batangan
                  </span>
                </div>
                <div className="space-y-3">
                  {kpi.plants.map((p: any) => {
                    const tsg = p.production?.tsgKg ?? 0;
                    const out = p.production?.outputKg ?? 0;
                    return (
                      <div key={p.id}>
                        <p className="text-sm font-medium mb-1">{p.name}</p>
                        <div className="space-y-[2px]">
                          {[
                            { v: tsg, c: "#2a78d6", label: "TSG Diproses" },
                            { v: out, c: "#eb6834", label: "Hasil Batangan" },
                          ].map((s) => (
                            <div key={s.label} className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-gray-100 rounded">
                                <div
                                  className="h-full rounded-sm"
                                  style={{ width: `${maxKg > 0 ? Math.min(100, (s.v / maxKg) * 100) : 0}%`, background: s.c }}
                                  title={`${p.name} — ${s.label}: ${s.v.toFixed(2)} kg`}
                                />
                              </div>
                              <span className="w-20 text-xs text-right text-gray-600 flex-shrink-0">{s.v.toFixed(2)} kg</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            {maxWaste > 0 && (
              <Card>
                <CardTitle>Waste per Pabrik</CardTitle>
                <p className="text-sm text-gray-500 mb-4">Total waste (kg) — rincian per kategori</p>
                <div className="space-y-4">
                  {kpi.plants.map((p: any) => {
                    const waste = p.waste ?? {};
                    const w = (Object.values(waste) as number[]).reduce((a: number, b: number) => a + b, 0);
                    const categories = ["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"] as const;
                    return (
                      <div key={p.id}>
                        <div className="flex items-center gap-3">
                          <span className="w-32 text-sm font-medium flex-shrink-0">{p.name}</span>
                          <div className="flex-1 h-5 bg-gray-100 rounded">
                            <div
                              className="h-full rounded-sm"
                              style={{ width: `${maxWaste > 0 ? Math.min(100, (w / maxWaste) * 100) : 0}%`, background: "#2a78d6" }}
                              title={`${p.name}: ${w.toFixed(2)} kg`}
                            />
                          </div>
                          <span className="w-20 text-sm text-right text-gray-600 flex-shrink-0">{w.toFixed(2)} kg</span>
                        </div>
                        <div className="mt-1 ml-32 text-xs text-gray-500 flex flex-wrap gap-x-3">
                          {categories.map((c) => (
                            <span key={c}>
                              {c.replace("_", " ")}: <span className="font-medium text-gray-600">{(waste[c] ?? 0).toFixed(2)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Grafik: yield per pabrik */}
      {kpi.plants?.length > 0 && kpi.plants.some((p: any) => p.production?.yieldPct != null) && (
        <Card className="mb-6">
          <CardTitle>Yield per Pabrik</CardTitle>
          <p className="text-sm text-gray-500 mb-4">Area target hijau = 110–114%</p>
          <div className="space-y-3">
            {kpi.plants.map((p: any) => {
              const y = p.production?.yieldPct;
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-32 text-sm font-medium flex-shrink-0">{p.name}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded relative">
                    {/* band target 110-114 */}
                    <div className="absolute inset-y-0 bg-green-50 border-x border-dashed border-green-500" style={{ left: "42%", width: "12%" }} />
                    {y != null && (
                      <div
                        className="absolute inset-y-0 rounded-sm"
                        style={{
                          left: `${Math.min(100, Math.max(0, ((y - 95) / 25) * 100))}%`,
                          width: "3px",
                          background: y >= 110 && y <= 114 ? "#0ca30c" : "#d03b3b",
                        }}
                        title={`${p.code}: ${y}%`}
                      />
                    )}
                  </div>
                  <span className="w-16 text-sm text-right flex-shrink-0">{y != null ? `${y}%` : "-"}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Grafik: downtime per pabrik */}
      {kpi.plants?.length > 0 && kpi.plants.some((p: any) => (p.downtimeMinutes ?? 0) > 0) && (
        <Card className="mb-6">
          <CardTitle>Downtime per Pabrik</CardTitle>
          <div className="mt-3 space-y-3">
            {kpi.plants.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="w-32 text-sm font-medium flex-shrink-0">{p.name}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded">
                  <div
                    className="h-full bg-yellow-500 rounded"
                    style={{ width: `${Math.min(100, ((p.downtimeMinutes ?? 0) / 60) * 100)}%` }}
                    title={`${p.downtimeMinutes ?? 0} menit`}
                  />
                </div>
                <span className="w-20 text-sm text-right flex-shrink-0">{p.downtimeMinutes ?? 0} mnt</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {kpi.plants?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpi.plants.map((p: any) => {
            const y = p.production?.yieldPct;
            const wasteTotal = (Object.values(p.waste ?? {}) as number[]).reduce((a: number, b: number) => a + b, 0);
            return (
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
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Shift Hari Ini", value: `${p.shifts?.total ?? 0} (${p.shifts?.running ?? 0} berjalan · ${p.shifts?.approved ?? 0} approved)` },
                    { label: "Boks Diproses", value: p.production?.boxes ?? 0 },
                    { label: "TSG Diproses", value: `${(p.production?.tsgKg ?? 0).toFixed(2)} kg` },
                    { label: "Hasil Batangan", value: `${(p.production?.outputKg ?? 0).toFixed(2)} kg` },
                    {
                      label: "Yield",
                      value: y != null ? `${y}%` : "-",
                      color: y != null ? (y >= 110 && y <= 114 ? "text-green-700" : "text-red-700") : "text-gray-900",
                    },
                    { label: "Waste", value: `${wasteTotal.toFixed(1)}kg` },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color ?? "text-gray-900"}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
