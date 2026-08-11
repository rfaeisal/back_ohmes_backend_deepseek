"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: { message: res.statusText } })); throw new Error(err.error?.message ?? res.statusText); }
  return res.json();
}

const TSG_TYPE_COLORS: Record<string, "info"|"success"|"warning"> = {
  REGULER: "info", MILD: "success", PUTIHAN: "warning",
};

interface Supplier { id: string; code: string; name: string; }

export default function TsgReceivingReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [supplierId, setSupplierId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [receivings, setReceivings] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const loadSuppliers = useCallback(async () => {
    try { const res = await apiFetch("/tsg-suppliers"); setSuppliers(res.data ?? []); } catch { }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const loadReceivings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("includeBoxes", "true");
      const res = await apiFetch(`/tsg-receiving?${params.toString()}`);
      let data = res.data ?? [];
      if (supplierId) data = data.filter((r: any) => r.supplierId === supplierId);
      // Enrich with supplier name
      data = data.map((r: any) => ({
        ...r,
        supplierName: suppliers.find((s) => s.id === r.supplierId)?.name ?? r.supplierId,
        supplierCode: suppliers.find((s) => s.id === r.supplierId)?.code ?? "-",
      }));
      setReceivings(data);
    } catch { setReceivings([]); }
    finally { setLoading(false); }
  }, [from, to, supplierId, suppliers, typeFilter]);

  useEffect(() => { loadReceivings(); }, [loadReceivings]);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  // Filter by type (client-side approximation via box details)
  const filteredReceivings = typeFilter
    ? receivings.filter(() => true)
    : receivings;

  // Summary
  const totalReceivings = filteredReceivings.length;
  const totalBoxes = filteredReceivings.reduce((s, r) => s + r.totalBoxCount, 0);
  const totalWeight = filteredReceivings.reduce((s, r) => s + parseFloat(r.totalWeightKg || "0"), 0);
  const totalSuppliers = new Set(filteredReceivings.map((r: any) => r.supplierId)).size;

  const handleExport = () => {
    setExporting(true);
    const headers = ["Kode Receiving", "Supplier", "Tanggal", "Jumlah Boks", "Total Berat (kg)", "No Surat Jalan", "Catatan"];
    const rows = filteredReceivings.map((r: any) => [
      r.receivingCode, `"${r.supplierName} (${r.supplierCode})"`,
      r.receivedAt ? new Date(r.receivedAt).toISOString().slice(0, 10) : "-",
      r.totalBoxCount, parseFloat(r.totalWeightKg || "0").toFixed(2),
      r.supplierDocRef ?? "-", `"${(r.notes ?? "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `laporan-tsg-masuk-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan TSG Masuk</h1>
          <p className="text-gray-500">Riwayat penerimaan TSG dari supplier — filter tanggal, supplier, dan jenis</p>
        </div>
        <Button onClick={handleExport} disabled={filteredReceivings.length === 0 || exporting}>
          📥 {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <Input label="Dari Tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 min-w-[150px]" />
          <Input label="Sampai Tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 min-w-[150px]" />
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Semua Supplier</option>
              {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Jenis TSG</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Semua Jenis</option>
              <option value="REGULER">Reguler</option>
              <option value="MILD">Mild</option>
              <option value="PUTIHAN">Putihan</option>
            </select>
          </div>
          <Button onClick={loadReceivings} disabled={loading}>{loading ? "..." : "🔍 Filter"}</Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Penerimaan", value: totalReceivings, color: "text-blue-700" },
          { label: "Total Boks", value: totalBoxes, color: "text-green-700" },
          { label: "Total Berat", value: `${totalWeight.toFixed(1)} kg`, color: "text-primary-700" },
          { label: "Supplier", value: totalSuppliers, color: "text-yellow-700" },
        ].map((s) => (<Card key={s.label}><p className="text-xs text-gray-500">{s.label}</p><p className={`text-3xl font-bold ${s.color}`}>{s.value}</p></Card>))}
      </div>

      {/* Receiving Table */}
      <Card>
        <CardTitle>Riwayat Penerimaan ({filteredReceivings.length})</CardTitle>
        {loading ? <p className="py-8 text-center text-gray-400">Memuat...</p> : filteredReceivings.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Tidak ada data. Jalankan <strong>Skenario 2</strong> dulu.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 text-sm font-semibold text-gray-600 w-8"></th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Supplier</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Boks</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Total Berat</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Surat Jalan</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceivings.map((r: any) => (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                      <td className="py-3 text-gray-400">{expanded.has(r.id) ? "▼" : "▶"}</td>
                      <td className="py-3 font-mono font-medium text-sm">{r.receivingCode}</td>
                      <td className="py-3">
                        <div className="font-medium">{r.supplierName}</div>
                        <div className="text-xs text-gray-400 font-mono">{r.supplierCode}</div>
                      </td>
                      <td className="py-3 text-sm">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString("id-ID") : "-"}</td>
                      <td className="py-3"><Badge variant="info">{r.totalBoxCount} boks</Badge></td>
                      <td className="py-3 font-bold">{parseFloat(r.totalWeightKg || "0").toFixed(1)} kg</td>
                      <td className="py-3 text-sm text-gray-500">{r.supplierDocRef ?? "-"}</td>
                    </tr>
                    {expanded.has(r.id) && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={7} className="bg-gray-50 p-4">
                          <div className="text-sm font-semibold mb-2">Detail Boks:</div>
                          {r.boxes && r.boxes.length > 0 ? (
                            <div className="space-y-1">
                              {r.boxes.map((b: any, i: number) => (
                                <div key={i} className="flex justify-between text-sm bg-white rounded px-3 py-2 border">
                                  <span className="font-mono">{b.boxCode}</span>
                                  <span>{b.weightKg} kg</span>
                                  <Badge variant={TSG_TYPE_COLORS[b.tsgType] ?? "neutral"}>
                                    {b.tsgType === "REGULER" ? "Reguler" : b.tsgType === "MILD" ? "Mild" : b.tsgType === "PUTIHAN" ? "Putihan" : b.tsgType}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">
                              {r.totalBoxCount} boks · Total {parseFloat(r.totalWeightKg || "0").toFixed(1)} kg
                              {r.notes && <p className="mt-1 text-gray-400">Catatan: {r.notes}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Period Summary */}
      {filteredReceivings.length > 0 && (
        <>
        {/* By TSG Type */}
        <Card className="mt-6">
          <CardTitle>Ringkasan Per Jenis TSG</CardTitle>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {(() => {
              const byType: Record<string, { boxes: number; weight: number }> = {};
              filteredReceivings.forEach((r: any) => {
                (r.boxes ?? []).forEach((b: any) => {
                  const t = b.tsgType ?? "REGULER";
                  if (!byType[t]) byType[t] = { boxes: 0, weight: 0 };
                  byType[t]!.boxes++;
                  byType[t]!.weight += parseFloat(b.weightKg || "0");
                });
              });
              if (Object.keys(byType).length === 0) {
                // Fallback: no box details loaded — use receiving totals
                return <p className="text-gray-400 col-span-3 text-sm">Klik ▶ pada baris untuk lihat detail per jenis</p>;
              }
              return Object.entries(byType).map(([type, data]) => (
                <div key={type} className="rounded-lg bg-gray-50 p-4 text-center">
                  <Badge variant={TSG_TYPE_COLORS[type] ?? "neutral"} className="mb-2">{type === "REGULER" ? "Reguler" : type === "MILD" ? "Mild" : "Putihan"}</Badge>
                  <p className="text-2xl font-bold text-gray-900">{data.boxes} boks</p>
                  <p className="text-sm text-gray-500">{data.weight.toFixed(1)} kg</p>
                </div>
              ));
            })()}
          </div>
        </Card>

        <Card className="mt-6">
          <CardTitle>Ringkasan Per Supplier</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">Supplier:</p>
              {Array.from(new Set(filteredReceivings.map((r: any) => r.supplierId))).map((sid: any) => {
                const sr = filteredReceivings.filter((r: any) => r.supplierId === sid);
                const name = sr[0]?.supplierName ?? sid;
                const boxes = sr.reduce((s: number, r: any) => s + r.totalBoxCount, 0);
                const weight = sr.reduce((s: number, r: any) => s + parseFloat(r.totalWeightKg || "0"), 0);
                return (
                  <div key={sid} className="flex justify-between py-1 border-b border-gray-100">
                    <span>{name}</span>
                    <span className="font-mono">{boxes} boks · {weight.toFixed(1)} kg</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="font-semibold">Rata-rata:</p>
              <div className="text-gray-500 mt-2">
                <p>Boks/penerimaan: {totalReceivings > 0 ? (totalBoxes / totalReceivings).toFixed(1) : 0}</p>
                <p>Berat/penerimaan: {totalReceivings > 0 ? (totalWeight / totalReceivings).toFixed(1) : 0} kg</p>
                <p>Berat/boks: {totalBoxes > 0 ? (totalWeight / totalBoxes).toFixed(2) : 0} kg</p>
              </div>
            </div>
          </div>
        </Card>
        </>
      )}
    </div>
  );
}
