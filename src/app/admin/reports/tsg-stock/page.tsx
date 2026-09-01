"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";


export default function TsgStockReport() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [allInventory, setAllInventory] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [plantFilter, setPlantFilter] = useState("");
  const [plants, setPlants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // plantId=all: semua plant dalam scope user (area = sekawasan, plant = 1 pabrik)
      const data = await apiFetch("/tsg-inventory/available?limit=500&plantId=all");
      const items = (data.data ?? [])
        .map((item: any) => ({ ...item, id: item.inventoryId ?? item.id }))
        .sort((a: any, b: any) =>
          (a.plantCode ?? "").localeCompare(b.plantCode ?? "") ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      setAllInventory(items);
      setInventory(items);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { (async () => { try { const r = await apiFetch("/plants"); setPlants(r.data ?? []); } catch {} })(); }, []);

  useEffect(() => {
    let filtered = allInventory;
    if (typeFilter) filtered = filtered.filter(i => i.tsgType === typeFilter);
    if (plantFilter) filtered = filtered.filter(i => i.plantId === plantFilter);
    setInventory(filtered);
  }, [typeFilter, plantFilter, allInventory]);

  useEffect(() => { load(); }, [load]);

  // Stats
  const total = inventory.length;
  const reguler = inventory.filter(i => i.tsgType === "REGULER").length;
  const mild = inventory.filter(i => i.tsgType === "MILD").length;
  const putihan = inventory.filter(i => i.tsgType === "PUTIHAN").length;
  const totalWeight = inventory.reduce((s, i) => s + parseFloat(i.weightKg || "0"), 0);
  const oldStock = inventory.filter(i => (i.ageInDays ?? 0) > 30).length;
  const cautionStock = inventory.filter(i => (i.ageInDays ?? 0) > 14 && (i.ageInDays ?? 0) <= 30).length;

  const handleExport = () => {
    const headers = ["Kode Boks", "Pabrik", "Jenis", "Berat (kg)", "Umur (hari)", "Lokasi", "Status"];
    const rows = inventory.map(i => [i.boxCode, i.plantCode ?? "-", i.tsgType || "REGULER", i.weightKg, i.ageInDays ?? "?", i.locationCode ?? "-", "AVAILABLE"]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "stok-tsg.csv"; a.click();
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data stok...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-3xl font-bold text-gray-900">Laporan Stok TSG</h1><p className="text-gray-500">Inventory TSG saat ini — tersedia di gudang</p></div>
        <div className="flex gap-3">
          <select className="rounded-lg border px-3 py-2 text-sm bg-white" value={plantFilter} onChange={e => setPlantFilter(e.target.value)}>
            <option value="">Semua Pabrik</option>
            {plants.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm bg-white" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Semua Jenis</option><option value="REGULER">Reguler</option><option value="MILD">Mild</option><option value="PUTIHAN">Putihan</option>
          </select>
          <Button onClick={handleExport} disabled={inventory.length === 0}>📥 Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Total Boks</p><p className="text-3xl font-bold text-blue-700">{total}</p></Card>
        <Card><p className="text-xs text-gray-500">Total Berat</p><p className="text-3xl font-bold text-primary-700">{totalWeight.toFixed(1)} kg</p></Card>
        <Card><p className="text-xs text-gray-500">Peringatan (&gt;14 hari)</p><p className="text-3xl font-bold text-yellow-700">{cautionStock}</p></Card>
        <Card><p className="text-xs text-gray-500">Kritis (&gt;30 hari)</p><p className="text-3xl font-bold text-red-700">{oldStock}</p></Card>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardTitle>Per Jenis</CardTitle>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between"><span>Reguler</span><Badge variant="info">{reguler} boks</Badge></div>
            <div className="flex justify-between"><span>Mild</span><Badge variant="success">{mild} boks</Badge></div>
            <div className="flex justify-between"><span>Putihan</span><Badge variant="warning">{putihan} boks</Badge></div>
          </div>
        </Card>
        <Card><CardTitle>Per Umur</CardTitle>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between"><span>0-14 hari (Normal)</span><Badge variant="success">{total - cautionStock - oldStock} boks</Badge></div>
            <div className="flex justify-between"><span>15-30 hari (Caution)</span><Badge variant="warning">{cautionStock} boks</Badge></div>
            <div className="flex justify-between"><span>&gt;30 hari (Alert)</span><Badge variant="error">{oldStock} boks</Badge></div>
          </div>
        </Card>
        <Card><CardTitle>Rata-rata</CardTitle>
          <div className="mt-2 text-sm text-gray-500">
            <p>Berat/boks: {total > 0 ? (totalWeight / total).toFixed(2) : 0} kg</p>
            <p>Umur rata-rata: {total > 0 ? Math.round(inventory.reduce((s, i) => s + (i.ageInDays ?? 0), 0) / total) : 0} hari</p>
            <p>Boks &gt;30 hari: {oldStock} ({total > 0 ? ((oldStock / total) * 100).toFixed(1) : 0}%)</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Daftar Stok ({total} boks)</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode Boks</th><th className="pb-3 text-sm font-semibold text-gray-600">Pabrik</th><th className="pb-3 text-sm font-semibold text-gray-600">Jenis</th><th className="pb-3 text-sm font-semibold text-gray-600">Berat</th><th className="pb-3 text-sm font-semibold text-gray-600">Umur</th><th className="pb-3 text-sm font-semibold text-gray-600">Lokasi</th></tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">Stok kosong. Terima TSG dulu di halaman Gudang.</td></tr>
              ) : inventory.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 font-mono text-sm">{item.boxCode}</td>
                  <td className="py-2 text-sm text-gray-600">{item.plantCode ?? "-"}</td>
                  <td className="py-2"><Badge variant={item.tsgType === "REGULER" ? "info" : item.tsgType === "MILD" ? "success" : "warning"}>{item.tsgType ?? "REGULER"}</Badge></td>
                  <td className="py-2">{item.weightKg} kg</td>
                  <td className="py-2"><Badge variant={(item.ageInDays ?? 0) > 30 ? "error" : (item.ageInDays ?? 0) > 14 ? "warning" : "success"}>{item.ageInDays ?? "?"} hari</Badge></td>
                  <td className="py-2 text-sm text-gray-500">{item.locationCode ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
