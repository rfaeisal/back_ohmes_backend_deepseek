"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// =============================================================================
// Laporan Rijekan — ledger rijekan (docs/23 §5.4)
// Masuk otomatis: waste RIJEKAN settle (KG) + reject HLP (BATANG).
// Keluar manual saat receiving reproses dibuat.
// =============================================================================

export default function RijekanReport() {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // WIB (gotcha #12)
  const lastMonth = new Date(Date.now() - 30 * 86400000 + 7 * 3600000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await apiFetch(`/rijekan?${params.toString()}`);
      setSummary(data.summary ?? null);
      setEntries(data.data ?? []);
    } catch { setEntries([]); setSummary(null); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const entryLabel = (t: string) =>
    t === "IN_MAKER_WASTE"
      ? "Rijekan MAKER"
      : t === "IN_MAKER_MENIR"
        ? "Menir MAKER"
        : t === "IN_HLP_REJECT"
          ? "Reject HLP"
          : t === "IN_STAGE_REJECT"
            ? "Reject Stage (WR/SLOP/BAL)"
            : "Keluar Reproses";

  const entryBadge = (t: string) =>
    t === "IN_MAKER_WASTE" ? (
      <Badge variant="warning">MAKER</Badge>
    ) : t === "IN_MAKER_MENIR" ? (
      <Badge variant="warning">MENIR</Badge>
    ) : t === "IN_HLP_REJECT" ? (
      <Badge variant="error">HLP</Badge>
    ) : t === "IN_STAGE_REJECT" ? (
      <Badge variant="error">STAGE</Badge>
    ) : (
      <Badge variant="success">REPROSES</Badge>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan Rijekan</h1>
          <p className="text-gray-500">Rijekan MAKER (kg) + reject HLP (batang) → reproses jadi TSG</p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dari</label>
            <input type="date" className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sampai</label>
            <input type="date" className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Masuk MAKER (riek + menir)</p><p className="text-3xl font-bold text-yellow-700">{summary?.inKg ?? 0} kg</p></Card>
        <Card><p className="text-xs text-gray-500">Masuk Reject HLP</p><p className="text-3xl font-bold text-red-700">{summary?.inBatang ?? 0} batang</p></Card>
        <Card><p className="text-xs text-gray-500">Reject Stage (P/S/B)</p><p className="text-3xl font-bold text-red-700">{summary?.inStage?.PACK ?? 0} · {summary?.inStage?.SLOP ?? 0} · {summary?.inStage?.BAL ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Keluar Reproses</p><p className="text-3xl font-bold text-green-700">{summary?.outKg ?? 0} kg · {summary?.outBatang ?? 0} batang</p></Card>
        <Card><p className="text-xs text-gray-500">Saldo (kg)</p><p className="text-3xl font-bold text-blue-700">{summary?.saldoKg ?? 0} kg</p></Card>
        <Card><p className="text-xs text-gray-500">Saldo Reject HLP (batang)</p><p className="text-3xl font-bold text-blue-700">{summary?.saldoBatang ?? 0} batang</p></Card>
      </div>

      {/* Rincian */}
      <Card>
        <CardTitle>Rincian ({entries.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Waktu</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Jenis</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Jumlah</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Satuan</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">TSG</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Asal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Belum ada rijekan tercatat. Settle waste RIJEKAN/MENIR di shift, catat reject di HLP/stage.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-3 text-sm">{new Date(e.createdAt).toLocaleString("id-ID")}</td>
                  <td className="py-3">
                    {entryBadge(e.entryType)}
                    <span className="ml-2 text-xs text-gray-500">{entryLabel(e.entryType)}</span>
                  </td>
                  <td className="py-3 font-mono">{e.quantity}</td>
                  <td className="py-3 text-sm">{e.unit}</td>
                  <td className="py-3 text-sm">{e.tsgType ?? "-"}</td>
                  <td className="py-3 text-sm">
                    {e.origin === "MAKLOON" ? <Badge variant="warning">MAKLOON</Badge> : e.origin === "INTERNAL" ? <Badge variant="neutral">INTERNAL</Badge> : "-"}
                  </td>
                  <td className="py-3 text-sm text-gray-500 max-w-[260px] truncate" title={e.note ?? ""}>{e.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={() => {
          const headers = ["Waktu", "Jenis", "Jumlah", "Satuan", "Catatan"];
          const rows = entries.map((e) => [
            new Date(e.createdAt).toLocaleString("id-ID"),
            entryLabel(e.entryType),
            e.quantity,
            e.unit,
            `"${(e.note ?? "").replace(/"/g, '""')}"`,
          ]);
          const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `rijekan-${from}-to-${to}.csv`; a.click();
        }}>📥 Export CSV</Button>
      </div>
    </div>
  );
}
