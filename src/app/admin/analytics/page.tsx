"use client";
import { apiFetch, getToken } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [oee, setOee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [plantCodes, setPlantCodes] = useState<Map<string, string>>(new Map());

  const [mode, setMode] = useState<"day" | "week">("week");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  });

  const getPeriod = () => {
    if (mode === "day") return { from: date, to: date };
    const end = new Date(weekStart + "T00:00:00");
    end.setDate(end.getDate() + 6);
    return { from: weekStart, to: end.toISOString().slice(0, 10) };
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Plant ID dari scope JWT (bukan hardcoded)
      let plantId = "";
      const token = getToken();
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]!));
          plantId = payload.plantIds?.[0] ?? "";
        } catch {}
      }
      if (!plantId) {
        const plantsRes = await apiFetch("/plants");
        plantId = plantsRes?.data?.[0]?.id ?? "";
      }

      const { from, to } = getPeriod();

      const [analytics, oeeData, plantsRes] = await Promise.all([
        apiFetch(`/dashboards/hq/analytics?from=${from}&to=${to}`),
        plantId ? apiFetch(`/dashboards/oee/${plantId}?from=${from}&to=${to}`) : Promise.resolve(null),
        apiFetch("/plants").catch(() => null),
      ]);
      setData(analytics);
      setOee(oeeData);
      if (plantsRes?.data) {
        setPlantCodes(new Map(plantsRes.data.map((p: any) => [p.id, p.name])));
      }
    } catch { } finally { setLoading(false); }
  }, [mode, date, weekStart]);

  useEffect(() => { load(); }, [load]);

  const plantLabel = (id: string) => plantCodes.get(id) ?? id.slice(0, 8);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data analitik...</div>;

  // Cek ada data sama sekali?
  const hasAnyData =
    (data?.yieldTrend?.length ?? 0) > 0 ||
    Object.keys(data?.wasteBenchmark ?? {}).length > 0 ||
    (data?.consumption?.length ?? 0) > 0 ||
    (data?.inventoryAge?.aging?.length ?? 0) > 0 ||
    (oee?.shifts ?? 0) > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">HQ Analytics</h1>
          <p className="text-gray-500">Analitik lintas pabrik untuk HQ Analyst</p>
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => shiftWeek(-1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white hover:bg-gray-100">←</button>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
              <button onClick={() => shiftWeek(1)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white hover:bg-gray-100">→</button>
            </div>
          )}
        </div>
      </div>

      {!hasAnyData && (
        <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          📊 Tidak ada data analitik pada periode ini.
          {mode === "week"
            ? <> Minggu <strong>{weekStart}</strong> belum ada shift APPROVED.</>
            : <> Tanggal <strong>{date}</strong> belum ada shift APPROVED.</>}
          Jalankan produksi &amp; approval dulu.
        </div>
      )}

      {/* OEE */}
      {oee && (
        <Card className="mb-6">
          <CardTitle>OEE — {oee.plantName} ({oee.plantCode}) · {oee.from} → {oee.to}</CardTitle>
          <div className="grid grid-cols-4 gap-4 mt-4">
            {[
              { label: "OEE", value: `${oee.avgOee}%`, color: oee.avgOee > 80 ? "text-green-700" : oee.avgOee > 60 ? "text-yellow-700" : "text-red-700" },
              { label: "Availability", value: `${oee.avgAvailability}%` },
              { label: "Performance", value: `${oee.avgPerformance}%` },
              { label: "Quality", value: `${oee.avgQuality}%` },
            ].map((s) => (
              <div key={s.label} className="text-center rounded-lg bg-gray-50 p-4">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color ?? "text-gray-900"}`}>{s.value}</p>
              </div>
            ))}
            <p className="text-sm text-gray-400 mt-2 col-span-4">{oee.shifts} shift dianalisis</p>
          </div>
        </Card>
      )}

      {/* Yield Trend — bar chart */}
      {data?.yieldTrend && data.yieldTrend.length > 0 && (
        <Card className="mb-6">
          <CardTitle>Yield Trend ({data.yieldTrend.length} bulan)</CardTitle>
          <p className="text-sm text-gray-500 mb-2">Area hijau = target 110–114%</p>
          <div className="relative pt-6 pb-1">
            {/* band target */}
            <div className="absolute left-0 right-0 border-y border-dashed border-green-500 bg-green-50" style={{ top: "38%", height: "16%" }}>
              <span className="absolute right-2 top-1 text-[10px] text-green-700">110–114%</span>
            </div>
            <div className="flex items-end gap-1" style={{ height: "140px" }}>
              {data.yieldTrend.slice(0, 24).map((y: any) => (
                <div key={y.month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0" title={`${y.month}: ${y.yieldPct}% (${y.boxCount} boks)`}>
                  <div
                    className="w-full max-w-[36px] rounded-t"
                    style={{
                      height: `${Math.min(100, Math.max(3, ((y.yieldPct - 95) / 25) * 100))}%`,
                      background: y.yieldPct >= 110 && y.yieldPct <= 114 ? "#0ca30c" : "#d03b3b",
                      opacity: 0.85,
                    }}
                  />
                  <span className="text-[10px] text-gray-500">{y.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Waste Benchmark */}
      {data?.wasteBenchmark && Object.keys(data.wasteBenchmark).length > 0 && (
        <Card className="mb-6">
          <CardTitle>Waste Benchmark per Pabrik</CardTitle>
          <p className="text-sm text-gray-500 mb-3">Total kg per kategori limbah</p>
          <div className="space-y-2">
            {Object.entries(data.wasteBenchmark).map(([plantId, cats]: any) => (
              <div key={plantId}>
                <p className="text-xs font-mono text-gray-500 mb-1">{plantLabel(plantId)}</p>
                <div className="flex gap-1 h-5 rounded overflow-hidden">
                  {["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"].map((cat, i) => {
                    const kg = cats[cat] ?? 0;
                    return (
                      <div
                        key={cat}
                        style={{
                          width: `${(kg / (Math.max(1, ...Object.values(cats).map((v: any) => v))) * 100)}%`,
                          background: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"][i],
                        }}
                        title={`${cat}: ${kg} kg`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-gray-500">
            {["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"].map((cat, i) => (
              <span key={cat} className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full" style={{ background: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"][i] }} />
                {cat.replace("_", " ")}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Top Downtime Causes */}
      {data?.topDowntime && data.topDowntime.length > 0 && (
        <Card className="mb-6">
          <CardTitle>Penyebab Downtime Terbesar</CardTitle>
          <div className="mt-3 space-y-2">
            {data.topDowntime.map((d: any) => {
              const maxMin = Math.max(...data.topDowntime.map((x: any) => x.totalMinutes));
              return (
                <div key={d.category} className="flex items-center gap-3">
                  <span className="w-40 text-sm flex-shrink-0">{d.category.replace(/_/g, " ")}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded">
                    <div className="h-full bg-orange-500 rounded" style={{ width: `${(d.totalMinutes / maxMin) * 100}%` }} title={`${d.totalMinutes} menit (${d.occurrences}x)`} />
                  </div>
                  <span className="w-24 text-sm text-right flex-shrink-0">{d.totalMinutes} mnt · {d.occurrences}x</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Inventory Age & Consumption */}
      <div className="grid grid-cols-2 gap-6">
        {data?.inventoryAge && (
          <Card>
            <CardTitle>Inventory Age Alert</CardTitle>
            <div className="mt-4">
              {data.inventoryAge.aging?.slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm font-mono">{plantLabel(a.plantId)}</span>
                  <span>{a.count} boks</span>
                  <Badge variant={a.oldestDays > 30 ? "error" : a.oldestDays > 14 ? "warning" : "success"}>
                    Max {Math.round(a.oldestDays)} hari
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
        {data?.consumption && (
          <Card>
            <CardTitle>Consumption Rate (30 hari)</CardTitle>
            <div className="mt-4 space-y-2">
              {data.consumption.slice(0, 5).map((c: any, i: number) => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm font-mono">{plantLabel(c.plantId)}</span>
                  <span className="font-bold">{c.avgDailyKg} kg/hari</span>
                  <span className="text-sm text-gray-500">{c.activeDays} hari aktif</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
