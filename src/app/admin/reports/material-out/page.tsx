"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function MaterialOutReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [matType, setMatType] = useState("CONSUMABLE");
  const [outType, setOutType] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("materialType", matType);
      if (outType) params.set("outType", outType);
      const data = await apiFetch(`/reports/material-out?${params.toString()}`);
      setSummary(data.summary ?? null);
      setEntries(data.data ?? []);
    } catch { setEntries([]); setSummary(null); }
    finally { setLoading(false); }
  }, [from, to, matType, outType]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const headers = ["Kode", "Jenis Material", "Alur", "Tujuan/Supplier", "Tanggal", "Alasan", "Oleh"];
    const rows = entries.map((e) => [
      e.outCode,
      e.materialType === "CONSUMABLE" ? "CONSUMABLE" : "SPAREPART",
      e.outType === "TRANSFER" ? "KIRIM PABRIK" : "RETUR",
      `"${e.counterpartName}"`,
      e.outAt ? new Date(e.outAt).toLocaleDateString("id-ID") : "-",
      `"${(e.reason ?? "").replace(/"/g, '""')}"`,
      e.outByName ?? "-",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `material-keluar-${from}-to-${to}.csv`; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Material &amp; Sparepart Keluar</h1>
          <p className="text-gray-500">Kirim antar pabrik &amp; retur ke supplier</p>
        </div>
        <Button onClick={handleExport} disabled={entries.length === 0}>📥 Export CSV</Button>
      </div>

      {/* Toggle jenis */}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alur</label>
            <select className="rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={outType} onChange={(e) => setOutType(e.target.value)}>
              <option value="">Semua</option>
              <option value="TRANSFER">🚚 Kirim Pabrik Lain</option>
              <option value="RETUR">↩️ Retur Supplier</option>
            </select>
          </div>
          <Button onClick={load} disabled={loading}>{loading ? "..." : "🔍 Filter"}</Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Total Keluar</p><p className="text-3xl font-bold text-blue-700">{summary?.totalOut ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Item</p><p className="text-3xl font-bold text-indigo-700">{summary?.totalItems ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Kirim Pabrik</p><p className="text-3xl font-bold text-green-700">{summary?.totalTransfer ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Retur Supplier</p><p className="text-3xl font-bold text-red-700">{summary?.totalReturn ?? 0}</p></Card>
      </div>

      {/* Table */}
      <Card>
        <CardTitle>Riwayat Keluar ({entries.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Alur</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tujuan / Supplier</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Item</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Alasan</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Oleh</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Belum ada data keluar. Keluarkan material di halaman Gudang.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{e.outCode}</td>
                  <td className="py-3">
                    {e.outType === "TRANSFER" ? (
                      <Badge variant="info">🚚 KIRIM PABRIK</Badge>
                    ) : (
                      <Badge variant="error">↩️ RETUR</Badge>
                    )}
                  </td>
                  <td className="py-3 font-medium">{e.counterpartName}</td>
                  <td className="py-3 text-sm">{e.outAt ? new Date(e.outAt).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="py-3 text-sm">
                    {(e.items ?? []).map((it: any) => `${it.itemName} x${it.quantity}`).join(", ")}
                  </td>
                  <td className="py-3 text-sm text-gray-500 max-w-[200px] truncate" title={e.reason ?? ""}>{e.reason ?? "-"}</td>
                  <td className="py-3 text-sm text-gray-500">{e.outByName ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
