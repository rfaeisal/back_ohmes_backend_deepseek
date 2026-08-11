"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

type LabelData = {
  id: string;
  code: string;
  type: string;
  sub1: string;
  sub2: string;
  date: string;
};

export default function LabelsPage() {
  const [tab, setTab] = useState<"tsg" | "machine" | "batch">("tsg");
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      let res: any;
      if (tab === "tsg") res = await apiFetch("/tsg-inventory/available?limit=50");
      else if (tab === "machine") res = await apiFetch("/machines");
      setItems(res?.data ?? res ?? []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i: any) => i.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const buildLabels = (): LabelData[] => {
    const today = new Date().toISOString().slice(0, 10);
    return items
      .filter((i: any) => selected.has(i.id))
      .map((i: any) => ({
        id: i.id,
        code: i.boxCode ?? i.code ?? i.id?.slice(0, 8),
        type: tab === "tsg" ? "TSG_BOX" : tab === "machine" ? "MACHINE" : "BATCH",
        sub1: tab === "tsg" ? `${i.weightKg} kg` : i.type ?? i.name ?? "",
        sub2: tab === "tsg" ? `Umur ${i.ageInDays} hari` : i.name ?? "",
        date: today,
      }));
  };

  const handlePrint = () => {
    const labels = buildLabels();
    if (labels.length === 0) { alert("Pilih minimal 1 item."); return; }
    // Store labels in sessionStorage and open print page
    sessionStorage.setItem("printLabels", JSON.stringify(labels));
    window.open("/admin/labels/print", "_blank");
  };

  const itemsList: any[] = tab === "tsg" ? items : tab === "machine" ? items : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cetak Label</h1>
          <p className="text-gray-500">Generate & cetak label QR untuk boks TSG, mesin, dan batch</p>
        </div>
        <Button size="xl" onClick={handlePrint} disabled={selected.size === 0}>
          🖨 Cetak {selected.size} Label
        </Button>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "tsg", label: "📦 Boks TSG", count: items.length },
          { key: "machine", label: "⚙️ Mesin", count: 0 },
          { key: "batch", label: "📦 Batch", count: 0 },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as typeof tab); setSelected(new Set()); }}
            className={`rounded-lg px-4 py-2 font-medium transition-colors ${
              tab === t.key ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Printer Info */}
      <Card className="mb-6">
        <CardTitle>⚙️ Rekomendasi Printer & Label</CardTitle>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-bold">Printer</p>
            <p className="text-gray-500">Zebra ZT230 / TSC TE310</p>
            <p className="text-xs text-gray-400">Thermal Transfer, 203 DPI</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-bold">Label</p>
            <p className="text-gray-500">Polypropylene (BOPP) 100×60mm</p>
            <p className="text-xs text-gray-400">Waterproof, tahan minyak, 2-3 thn</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-bold">Ribbon</p>
            <p className="text-gray-500">Wax/Resin (WR)</p>
            <p className="text-xs text-gray-400">Tahan gesek & suhu gudang</p>
          </div>
        </div>
      </Card>

      {/* Items Table */}
      <Card>
        <CardTitle>
          {tab === "tsg" ? "Inventory TSG" : tab === "machine" ? "Mesin" : "Batch"} ({items.length})
          <span className="text-sm font-normal text-gray-400 ml-3">
            {selected.size} dipilih
          </span>
        </CardTitle>

        {loading ? (
          <p className="py-8 text-center text-gray-400">Memuat data...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            {tab === "tsg" ? "Belum ada boks TSG di inventory. Jalankan Skenario 2 dulu." : "Belum ada data."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 w-10">
                    <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} className="w-4 h-4" />
                  </th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Info</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Preview Label</th>
                </tr>
              </thead>
              <tbody>
                {itemsList.map((item: any) => (
                  <tr key={item.id} className={`border-b border-gray-100 ${selected.has(item.id) ? "bg-primary-50" : "hover:bg-gray-50"}`}>
                    <td className="py-3">
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="w-4 h-4" />
                    </td>
                    <td className="py-3 font-mono font-medium text-sm">
                      {item.boxCode ?? item.code ?? item.id?.slice(0, 8)}
                    </td>
                    <td className="py-3 text-sm text-gray-500">
                      {tab === "tsg" ? `${item.weightKg} kg · Umur ${item.ageInDays} hari · ${item.locationCode ?? "Rak -"}` : item.name ?? "-"}
                    </td>
                    <td className="py-3">
                      <Badge variant="success">{item.status ?? "ACTIVE"}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="border border-gray-200 rounded bg-white px-3 py-1.5 text-xs inline-block" style={{ width: 140 }}>
                        <div className="font-bold text-xs">{item.boxCode ?? item.code ?? "-"}</div>
                        <div className="text-gray-400">
                          {tab === "tsg" ? `${item.weightKg} kg` : item.type ?? ""}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
