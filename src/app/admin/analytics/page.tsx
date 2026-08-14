"use client";
import { apiFetch, getToken } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [oee, setOee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exportJob, setExportJob] = useState<any>(null);
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

      const [analytics, oeeData] = await Promise.all([
        apiFetch(`/dashboards/hq/analytics?from=${from}&to=${to}`),
        plantId ? apiFetch(`/dashboards/oee/${plantId}?from=${from}&to=${to}`) : Promise.resolve(null),
      ]);
      setData(analytics);
      setOee(oeeData);
    } catch { } finally { setLoading(false); }
  }, [mode, date, weekStart]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    const job = await apiFetch("/reports/cukai", {
      method: "POST",
      body: JSON.stringify({ from: "2026-01-01", to: "2026-12-31", format: "csv" }),
    });
    setExportJob(job);
    setTimeout(async () => {
      const status = await apiFetch(`/reports/cukai?jobId=${job.jobId}`);
      setExportJob(status);
    }, 3000);
  };

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
        <Button onClick={handleExport}>📥 Export Cukai</Button>
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

      {exportJob && (
        <Card className="mb-6" highlight={exportJob.status === "ready" ? "green" : "yellow"}>
          <CardTitle>Export Job: {exportJob.jobId}</CardTitle>
          <p>Status: <Badge variant={exportJob.status === "ready" ? "success" : "warning"}>{exportJob.status}</Badge></p>
          {exportJob.downloadUrl && <p className="text-sm text-gray-500 mt-2">Download: {exportJob.downloadUrl}</p>}
        </Card>
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

      {/* Yield Trend */}
      {data?.yieldTrend && data.yieldTrend.length > 0 && (
        <Card className="mb-6">
          <CardTitle>Yield Trend ({data.yieldTrend.length} data point)</CardTitle>
          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {data.yieldTrend.slice(0, 20).map((y: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded border border-gray-200 px-4 py-2">
                <span className="text-sm font-mono">{y.month}</span>
                <span className="text-sm text-gray-500">{y.boxCount} boks</span>
                <Badge variant={y.yieldPct >= 110 && y.yieldPct <= 114 ? "success" : "error"}>{y.yieldPct}%</Badge>
              </div>
            ))}
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
                  <span className="text-sm font-mono">{a.plantId?.slice(0, 8)}</span>
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
                  <span className="text-sm font-mono">{c.plantId?.slice(0, 8)}</span>
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
