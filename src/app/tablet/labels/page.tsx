"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
  });
  if (!res.ok) return { data: [] };
  return res.json();
}

export default function StandaloneLabelsPage() {
  const [tab, setTab] = useState<"tsg" | "machine">("tsg");
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ tsg: 0, machine: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "tsg") {
        const res = await apiFetch("/tsg-inventory/available?limit=200");
        const data = (res?.data ?? []).map((item: any) => ({ ...item, id: item.inventoryId ?? item.id }));
        setItems(data); setCounts(prev => ({ ...prev, tsg: data.length }));
      } else {
        const res = await apiFetch("/machines");
        setItems(res?.data ?? []); setCounts(prev => ({ ...prev, machine: res?.data?.length ?? 0 }));
      }
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { loadItems(); }, [loadItems]);
  // Load both counts on mount
  useEffect(() => {
    apiFetch("/machines").then(r => setCounts(prev => ({ ...prev, machine: r?.data?.length ?? 0 })));
  }, []);

  const toggleAll = () => selected.size === items.length ? setSelected(new Set()) : setSelected(new Set(items.map((i: any) => i.id)));
  const toggle = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };

  const handlePrint = () => {
    const labels = items.filter((i: any) => selected.has(i.id)).map((i: any) => ({
      id: i.id ?? i.inventoryId, code: i.boxCode ?? i.code ?? (i.id ?? i.inventoryId)?.slice(0, 8),
      type: tab === "tsg" ? "TSG_BOX" : "MACHINE",
      sub1: tab === "tsg" ? `${i.weightKg} kg` : i.type ?? i.name ?? "",
      sub2: tab === "tsg" ? `Umur ${i.ageInDays ?? "?"} hari` : i.name ?? "",
      date: new Date().toISOString().slice(0, 10),
    }));
    if (labels.length === 0) { alert("Pilih minimal 1 item."); return; }
    sessionStorage.setItem("printLabels", JSON.stringify(labels));
    window.open("/print-labels", "_blank");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cetak Label</h1>
          <p className="text-gray-500">Pilih boks atau mesin untuk dicetak label QR</p>
        </div>
        <Button size="lg" onClick={handlePrint} disabled={selected.size === 0}>Cetak {selected.size} Label</Button>
      </div>

      <div className="flex gap-2 mb-6">
        {[
          { key: "tsg", label: "Boks TSG", count: counts.tsg },
          { key: "machine", label: "Mesin", count: counts.machine },
        ].map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "outline"}
            onClick={() => { setTab(t.key as typeof tab); setSelected(new Set()); }}>
            {t.label} ({t.count})
          </Button>
        ))}
      </div>

      <Card className="mb-6">
        <CardTitle>{tab === "tsg" ? "Inventory TSG" : "Mesin"} ({items.length}) <span className="text-sm font-normal text-gray-400 ml-3">{selected.size} dipilih</span></CardTitle>
        {loading ? <p className="py-8 text-center text-gray-400">Memuat...</p> : items.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Belum ada data. Terima TSG dulu di halaman Gudang.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr><th className="pb-3 w-10"><input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} className="w-4 h-4" /></th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Info</th><th className="pb-3 text-sm font-semibold text-gray-600">Jenis</th><th className="pb-3 text-sm font-semibold text-gray-600">Preview</th></tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className={`border-b border-gray-100 ${selected.has(item.id) ? "bg-primary-50" : "hover:bg-gray-50"}`}>
                    <td className="py-3"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="w-4 h-4" /></td>
                    <td className="py-3 font-mono font-medium text-sm">{item.boxCode ?? item.code ?? "-"}</td>
                    <td className="py-3 text-sm text-gray-500">{tab === "tsg" ? `${item.weightKg} kg · Umur ${item.ageInDays ?? "?"} hari` : item.name ?? "-"}</td>
                    <td className="py-3"><Badge variant={item.tsgType === "REGULER" ? "info" : item.tsgType === "MILD" ? "success" : "warning"}>{item.tsgType ?? "REGULER"}</Badge></td>
                    <td className="py-3"><div className="border border-gray-200 rounded bg-white px-3 py-1.5 text-xs inline-block" style={{ width: 140 }}><div className="font-bold text-xs">{item.boxCode ?? item.code ?? "-"}</div><div className="text-gray-400">{item.weightKg ?? item.type ?? ""}</div></div></td>
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
