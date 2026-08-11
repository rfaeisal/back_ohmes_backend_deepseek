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

interface ReceivingRecord {
  id: string;
  receivingCode: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  receivedAt: string;
  receivedBy: string;
  totalBoxCount: number;
  totalWeightKg: string;
  supplierDocRef: string | null;
  notes: string | null;
  boxes?: BoxDetail[];
}

interface BoxDetail {
  id: string;
  boxCode: string;
  weightKg: string;
  boxSeq: number;
}

interface Supplier {
  id: string;
  code: string;
  name: string;
}

export default function TsgReceivingReport() {
  const today = new Date().toISOString().slice(0, 10);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(today);
  const [supplierId, setSupplierId] = useState("");
  const [receivings, setReceivings] = useState<ReceivingRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await apiFetch("/tsg-suppliers");
      setSuppliers(res.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const loadReceivings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiFetch(`/tsg-receiving?${params.toString()}`);
      let data = res.data ?? [];

      // Client-side filter by supplier
      if (supplierId) data = data.filter((r: ReceivingRecord) => r.supplierId === supplierId);

      // API already returns supplierName & supplierCode via JOIN
      setReceivings(data);
    } catch { setReceivings([]); }
    finally { setLoading(false); }
  }, [from, to, supplierId, suppliers]);

  useEffect(() => { loadReceivings(); }, [loadReceivings]);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  // Summary calculations
  const totalReceivings = receivings.length;
  const totalBoxes = receivings.reduce((s, r) => s + r.totalBoxCount, 0);
  const totalWeight = receivings.reduce((s, r) => s + parseFloat(r.totalWeightKg || "0"), 0);
  const totalSuppliers = new Set(receivings.map((r) => r.supplierId)).size;

  // Export CSV
  const handleExport = () => {
    setExporting(true);
    const headers = ["Kode Receiving", "Supplier", "Tanggal", "Jumlah Boks", "Total Berat (kg)", "No Surat Jalan", "Catatan"];
    const rows = receivings.map((r) => [
      r.receivingCode,
      `"${r.supplierName} (${r.supplierCode})"`,
      r.receivedAt ? new Date(r.receivedAt).toISOString().slice(0, 10) : "-",
      r.totalBoxCount,
      parseFloat(r.totalWeightKg).toFixed(2),
      r.supplierDocRef ?? "-",
      `"${(r.notes ?? "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-tsg-masuk-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan TSG Masuk</h1>
          <p className="text-gray-500">Riwayat penerimaan TSG dari supplier</p>
        </div>
        <Button onClick={handleExport} disabled={receivings.length === 0 || exporting}>
          📥 {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <Input label="Dari Tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Input label="Sampai Tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Semua Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
          <Button onClick={loadReceivings} disabled={loading} className="mb-0">
            {loading ? "..." : "🔍 Filter"}
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Penerimaan", value: totalReceivings, color: "text-blue-700" },
          { label: "Total Boks", value: totalBoxes, color: "text-green-700" },
          { label: "Total Berat", value: `${totalWeight.toFixed(1)} kg`, color: "text-primary-700" },
          { label: "Supplier", value: totalSuppliers, color: "text-yellow-700" },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Receiving Table */}
      <Card>
        <CardTitle>Riwayat Penerimaan ({receivings.length})</CardTitle>
        {loading ? (
          <p className="py-8 text-center text-gray-400">Memuat data...</p>
        ) : receivings.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            Tidak ada data penerimaan untuk periode ini.
            <br />Jalankan <strong>Skenario 2</strong> (Gudang — Terima TSG) dulu.
          </p>
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
                {receivings.map((r) => (
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
                          <div className="grid grid-cols-5 gap-2">
                            {/* Show boxes — simplified since we don't fetch individual box details */}
                            <div className="col-span-5 text-sm text-gray-500">
                              {r.totalBoxCount} boks · Total {parseFloat(r.totalWeightKg || "0").toFixed(1)} kg
                              {r.notes && <p className="mt-1 text-gray-400">Catatan: {r.notes}</p>}
                            </div>
                          </div>
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
      {receivings.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Ringkasan Periode</CardTitle>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">Per Supplier:</p>
              {Array.from(new Set(receivings.map((r) => r.supplierId))).map((sid) => {
                const supplierReceivings = receivings.filter((r) => r.supplierId === sid);
                const name = supplierReceivings[0]?.supplierName ?? sid;
                const boxes = supplierReceivings.reduce((s, r) => s + r.totalBoxCount, 0);
                const weight = supplierReceivings.reduce((s, r) => s + parseFloat(r.totalWeightKg || "0"), 0);
                return (
                  <div key={sid} className="flex justify-between py-1 border-b border-gray-100">
                    <span>{name}</span>
                    <span className="font-mono">{boxes} boks · {weight.toFixed(1)} kg</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="font-semibold">Rata-rata per Penerimaan:</p>
              <div className="text-gray-500 mt-2">
                <p>Boks: {(totalBoxes / totalReceivings).toFixed(1)} boks</p>
                <p>Berat: {(totalWeight / totalReceivings).toFixed(1)} kg</p>
                <p>Berat per Boks: {totalBoxes > 0 ? (totalWeight / totalBoxes).toFixed(2) : 0} kg</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
