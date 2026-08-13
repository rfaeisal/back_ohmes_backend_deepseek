"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

export default function MaterialUsageReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [matType, setMatType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [from, setFrom] = useState(lastWeek);
  const [to, setTo] = useState(today);
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("materialType", matType);
      const res = await fetch(`${API}/reports/material-usage?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) { localStorage.removeItem("accessToken"); window.location.href = "/tablet/login"; return; }
      const data = await res.json();
      setItems(data.data ?? []);
      setSummary(data.summary ?? null);
    } catch { setItems([]); setSummary(null); }
    finally { setLoading(false); }
  }, [from, to, matType]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const headers = ["Kode", "Nama", "Unit", "Total Terpakai", "Jumlah Event", "Terakhir Dipakai"];
    const rows = items.map((i) => [
      i.code, `"${i.name}"`, i.unit, i.totalUsed, i.eventCount,
      i.lastUsed ? new Date(i.lastUsed).toLocaleString("id-ID") : "-",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pemakaian-${matType.toLowerCase()}-${from}-to-${to}.csv`; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pemakaian Material & Sparepart</h1>
          <p className="text-gray-500">Agregat pemakaian dari catatan produksi per shift</p>
        </div>
        <Button onClick={handleExport} disabled={items.length === 0}>📥 Export CSV</Button>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        {(["CONSUMABLE", "SPAREPART"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMatType(t)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              matType === t ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "CONSUMABLE" ? "🧵 Consumable" : "🔧 Sparepart"}
          </button>
        ))}
      </div>

      {/* Filter */}
      <Card className="mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <Input label="Dari Tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Sampai Tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={load} disabled={loading}>{loading ? "..." : "🔍 Filter"}</Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Item Terpakai</p><p className="text-3xl font-bold text-blue-700">{summary?.totalItems ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Quantity</p><p className="text-3xl font-bold text-green-700">{summary?.totalUsed ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Event</p><p className="text-3xl font-bold text-yellow-700">{summary?.totalEvents ?? 0}</p></Card>
      </div>

      <Card>
        <CardTitle>Pemakaian per Item ({items.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Nama</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Unit</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Total Terpakai</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Event</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Terakhir Dipakai</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Belum ada pemakaian pada periode ini.</td></tr>
              ) : items.map((item) => (
                <tr key={item.itemId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{item.code}</td>
                  <td className="py-3 font-medium">{item.name}</td>
                  <td className="py-3 text-sm text-gray-500">{item.unit}</td>
                  <td className="py-3 text-right font-bold">{item.totalUsed}</td>
                  <td className="py-3 text-right"><Badge variant="neutral">{item.eventCount}×</Badge></td>
                  <td className="py-3 text-sm text-gray-500">{item.lastUsed ? new Date(item.lastUsed).toLocaleString("id-ID") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
