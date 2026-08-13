"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

export default function MaterialReceivingReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [matType, setMatType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [receivings, setReceivings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("materialType", matType);
      const res = await fetch(`${API}/material-receiving?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) { localStorage.removeItem("accessToken"); window.location.href = "/tablet/login"; return; }
      const data = await res.json();
      setReceivings(data.data ?? []);
    } catch { setReceivings([]); }
    finally { setLoading(false); }
  }, [from, to, matType]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const totalReceivings = receivings.length;
  const totalItems = receivings.reduce((s, r) => s + (r.items?.length ?? 0), 0);
  const totalSuppliers = new Set(receivings.map((r) => r.supplierId)).size;

  const handleExport = () => {
    const headers = ["Kode", "Jenis", "Supplier", "Tanggal", "Surat Jalan", "Catatan"];
    const rows = receivings.map((r) => [
      r.receivingCode,
      r.materialType,
      `"${r.supplierName} (${r.supplierCode})"`,
      r.receivedAt ? new Date(r.receivedAt).toLocaleDateString("id-ID") : "-",
      r.supplierDocRef ?? "-",
      `"${(r.notes ?? "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((x) => x.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `material-masuk-${matType.toLowerCase()}-${from}-to-${to}.csv`; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Material Masuk</h1>
          <p className="text-gray-500">Riwayat penerimaan consumable & sparepart dari supplier</p>
        </div>
        <Button onClick={handleExport} disabled={receivings.length === 0}>📥 Export CSV</Button>
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
        <Card><p className="text-xs text-gray-500">Total Penerimaan</p><p className="text-3xl font-bold text-blue-700">{totalReceivings}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Item Diterima</p><p className="text-3xl font-bold text-green-700">{totalItems}</p></Card>
        <Card><p className="text-xs text-gray-500">Supplier</p><p className="text-3xl font-bold text-yellow-700">{totalSuppliers}</p></Card>
      </div>

      <Card>
        <CardTitle>Riwayat Penerimaan ({receivings.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600 w-8"></th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Supplier</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Item</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Surat Jalan</th>
              </tr>
            </thead>
            <tbody>
              {receivings.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Tidak ada data. Terima material di halaman Gudang.</td></tr>
              ) : receivings.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                    <td className="py-3 text-gray-400">{expanded.has(r.id) ? "▼" : "▶"}</td>
                    <td className="py-3 font-mono font-medium text-sm">{r.receivingCode}</td>
                    <td className="py-3">
                      <div className="font-medium">{r.supplierName}</div>
                      <div className="text-xs text-gray-400 font-mono">{r.supplierCode}</div>
                    </td>
                    <td className="py-3 text-sm">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString("id-ID") : "-"}</td>
                    <td className="py-3"><Badge variant="info">{r.items?.length ?? 0} item</Badge></td>
                    <td className="py-3 text-sm text-gray-500">{r.supplierDocRef ?? "-"}</td>
                  </tr>
                  {expanded.has(r.id) && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={6} className="bg-gray-50 p-4">
                        <div className="text-sm font-semibold mb-2">Detail Item:</div>
                        <div className="space-y-1">
                          {(r.items ?? []).map((it: any, i: number) => (
                            <div key={i} className="flex justify-between text-sm bg-white rounded px-3 py-2 border">
                              <span>{it.itemName}</span>
                              <span className="font-mono">{it.quantity} {it.itemUnit}</span>
                            </div>
                          ))}
                        </div>
                        {r.notes && <p className="mt-2 text-sm text-gray-400">Catatan: {r.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
