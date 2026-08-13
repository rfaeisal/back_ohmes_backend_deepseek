"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

export default function MaterialStockReport() {
  const [matType, setMatType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/material-stock?materialType=${matType}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) { localStorage.removeItem("accessToken"); window.location.href = "/tablet/login"; return; }
      const data = await res.json();
      setItems(data.data ?? []);
    } catch { setItems([]); }
    setLoading(false);
  }, [matType]);

  useEffect(() => { load(); }, [load]);

  // Stats
  const totalMasuk = items.reduce((s, i) => s + i.masuk, 0);
  const totalTerpakai = items.reduce((s, i) => s + i.terpakai, 0);
  const totalSisa = items.reduce((s, i) => s + i.sisa, 0);
  const habis = items.filter((i) => i.sisa <= 0).length;

  const handleExport = () => {
    const headers = ["Kode", "Nama", "Unit", "Masuk", "Terpakai", "Sisa"];
    const rows = items.map((i) => [i.code, `"${i.name}"`, i.unit, i.masuk, i.terpakai, i.sisa]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `stok-${matType.toLowerCase()}.csv`; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stok Material & Sparepart</h1>
          <p className="text-gray-500">Sisa stok = masuk − terpakai (dihitung otomatis)</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleExport} disabled={items.length === 0}>📥 Export CSV</Button>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-6">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Total Item</p><p className="text-3xl font-bold text-blue-700">{items.length}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Masuk</p><p className="text-3xl font-bold text-green-700">{totalMasuk}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Terpakai</p><p className="text-3xl font-bold text-yellow-700">{totalTerpakai}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Sisa</p><p className="text-3xl font-bold text-primary-700">{totalSisa}</p></Card>
      </div>

      {habis > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          ⚠️ {habis} item stok habis / minus — segera order ke supplier.
        </div>
      )}

      <Card>
        <CardTitle>Stok {matType === "CONSUMABLE" ? "Consumable" : "Sparepart"} ({items.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Nama</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Unit</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Masuk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Terpakai</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Belum ada data. Terima material dulu di halaman Gudang.</td></tr>
              ) : items.map((item) => (
                <tr key={item.itemId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{item.code}</td>
                  <td className="py-3 font-medium">{item.name}</td>
                  <td className="py-3 text-sm text-gray-500">{item.unit}</td>
                  <td className="py-3 text-sm text-right">{item.masuk}</td>
                  <td className="py-3 text-sm text-right">{item.terpakai}</td>
                  <td className="py-3 text-right">
                    {item.sisa <= 0 ? (
                      <Badge variant="error">{item.sisa} — HABIS</Badge>
                    ) : item.sisa < 10 ? (
                      <Badge variant="warning">{item.sisa}</Badge>
                    ) : (
                      <Badge variant="success">{item.sisa}</Badge>
                    )}
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
