"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export default function TsgUsageReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastWeek);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await apiFetch(`/reports/tsg-usage?${params.toString()}`);
      setSummary(data.summary ?? { totalShifts: 0, totalBoxes: 0, totalTsgKg: 0, totalOutputKg: 0, avgYieldPct: 0 });
      setShifts(data.shifts ?? []);
    } catch { setSummary(null); setShifts([]); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const statusBadge = (s: string) => {
    const map: Record<string, { variant: "success" | "warning" | "info" | "neutral"; label: string }> = {
      RUNNING: { variant: "info", label: "RUNNING" },
      COMPLETED: { variant: "warning", label: "COMPLETED" },
      APPROVED: { variant: "success", label: "APPROVED" },
    };
    const m = map[s] ?? { variant: "neutral" as const, label: s };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  const yieldBadge = (pct: number) => {
    if (pct >= 110 && pct <= 114) return <Badge variant="success">{pct.toFixed(2)}%</Badge>;
    if (pct > 0) return <Badge variant="error">{pct.toFixed(2)}%</Badge>;
    return <span className="text-gray-400">-</span>;
  };

  const handleExport = () => {
    const headers = ["Tanggal", "Produk", "Mesin", "Status", "Boks", "TSG (kg)", "Output (kg)", "Yield (%)", "Mulai", "Selesai"];
    const rows = shifts.map(s => [
      s.reportDate,
      s.productName,
      s.machineCode,
      s.status,
      s.boxesCount,
      s.tsgUsedKg.toFixed(2),
      s.outputKg.toFixed(2),
      s.avgYieldPct.toFixed(2),
      s.actualStart ? new Date(s.actualStart).toLocaleTimeString("id-ID") : "-",
      s.actualEnd ? new Date(s.actualEnd).toLocaleTimeString("id-ID") : "-",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `penggunaan-tsg-${from}-to-${to}.csv`; a.click();
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data penggunaan TSG...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan Penggunaan TSG</h1>
          <p className="text-gray-500">Agregat pemakaian TSG per shift — input vs output, yield</p>
        </div>
        <Button onClick={handleExport} disabled={shifts.length === 0}>📥 Export CSV</Button>
      </div>

      {/* Filter */}
      <Card className="mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <Input label="Dari Tanggal" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input label="Sampai Tanggal" type="date" value={to} onChange={e => setTo(e.target.value)} />
          <Button onClick={load}>🔍 Filter</Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-500">Total Shift</p>
          <p className="text-3xl font-bold text-blue-700">{summary?.totalShifts ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Total Boks</p>
          <p className="text-3xl font-bold text-indigo-700">{summary?.totalBoxes ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Total TSG</p>
          <p className="text-3xl font-bold text-primary-700">{(summary?.totalTsgKg ?? 0).toFixed(1)} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Total Output</p>
          <p className="text-3xl font-bold text-green-700">{(summary?.totalOutputKg ?? 0).toFixed(1)} kg</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Yield Rata-rata</p>
          <p className={`text-3xl font-bold ${(summary?.avgYieldPct ?? 0) >= 110 && (summary?.avgYieldPct ?? 0) <= 114 ? "text-green-700" : "text-red-700"}`}>
            {(summary?.avgYieldPct ?? 0).toFixed(2)}%
          </p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardTitle>Daftar Shift ({shifts.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Produk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Mesin</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Boks</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">TSG (kg)</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Output (kg)</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Yield</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">Belum ada data shift. Mulai shift dulu di Tablet Operator.</td></tr>
              ) : shifts.map((s, i) => (
                <tr key={s.shiftId ?? i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 text-sm">{s.reportDate}</td>
                  <td className="py-2 text-sm font-medium">{s.productName}</td>
                  <td className="py-2 font-mono text-sm">{s.machineCode}</td>
                  <td className="py-2">{statusBadge(s.status)}</td>
                  <td className="py-2 text-sm text-right">{s.boxesCount}</td>
                  <td className="py-2 text-sm text-right">{s.tsgUsedKg.toFixed(2)}</td>
                  <td className="py-2 text-sm text-right">{s.outputKg.toFixed(2)}</td>
                  <td className="py-2 text-right">{yieldBadge(s.avgYieldPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
