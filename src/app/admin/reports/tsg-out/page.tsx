"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TsgOutReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [type, setType] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (type) params.set("type", type);
      const data = await apiFetch(`/reports/tsg-out?${params.toString()}`);
      setSummary(data.summary ?? null);
      setEntries(data.data ?? []);
    } catch { setEntries([]); setSummary(null); }
    finally { setLoading(false); }
  }, [from, to, type]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const headers = ["Kode", "Tipe", "Tujuan/Supplier", "Tanggal", "Boks", "Berat (kg)", "Keterangan", "Oleh"];
    const rows = entries.map((e) => [
      e.code,
      e.type === "TRANSFER" ? "KIRIM PABRIK" : "RETUR SUPPLIER",
      `"${e.counterpart}"`,
      e.date ? new Date(e.date).toLocaleDateString("id-ID") : "-",
      e.boxCount,
      e.weightKg,
      `"${(e.notes ?? "").replace(/"/g, '""')}"`,
      e.byName ?? "-",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tsg-keluar-${from}-to-${to}.csv`; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan TSG Keluar</h1>
          <p className="text-gray-500">Kirim antar pabrik &amp; retur ke supplier</p>
        </div>
        <Button onClick={handleExport} disabled={entries.length === 0}>📥 Export CSV</Button>
      </div>

      {/* Filter */}
      <Card className="mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <Input label="Dari Tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Sampai Tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
            <select className="rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Semua</option>
              <option value="TRANSFER">🚚 Kirim Pabrik Lain</option>
              <option value="RETUR">↩️ Retur Supplier</option>
            </select>
          </div>
          <Button onClick={load} disabled={loading}>{loading ? "..." : "🔍 Filter"}</Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Total Keluar</p><p className="text-3xl font-bold text-blue-700">{summary?.totalOut ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Boks</p><p className="text-3xl font-bold text-indigo-700">{summary?.totalBoxes ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Berat</p><p className="text-3xl font-bold text-primary-700">{(summary?.totalWeightKg ?? 0).toFixed(1)} kg</p></Card>
        <Card><p className="text-xs text-gray-500">Kirim Pabrik</p><p className="text-3xl font-bold text-green-700">{summary?.totalTransfer ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Retur Supplier</p><p className="text-3xl font-bold text-red-700">{summary?.totalReturn ?? 0}</p></Card>
      </div>

      {/* Table */}
      <Card>
        <CardTitle>Riwayat TSG Keluar ({entries.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tipe</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tujuan / Supplier</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Boks</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Berat</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Keterangan</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-gray-400">Belum ada TSG keluar. Kirim atau retur di halaman Gudang.</td></tr>
              ) : entries.map((e) => (
                <tr key={`${e.type}-${e.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{e.code}</td>
                  <td className="py-3">
                    {e.type === "TRANSFER" ? (
                      <Badge variant="info">🚚 KIRIM PABRIK</Badge>
                    ) : (
                      <Badge variant="error">↩️ RETUR</Badge>
                    )}
                  </td>
                  <td className="py-3 font-medium">{e.counterpart}</td>
                  <td className="py-3 text-sm">{e.date ? new Date(e.date).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="py-3 text-sm">{e.boxCount}</td>
                  <td className="py-3 font-bold">{e.weightKg.toFixed(1)} kg</td>
                  <td className="py-3 text-sm text-gray-500 max-w-[220px] truncate" title={e.notes ?? ""}>{e.notes ?? "-"}</td>
                  <td className="py-3">
                    <Link href={e.printUrl} target="_blank">
                      <Button size="sm" variant="outline">🖨 Cetak</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
