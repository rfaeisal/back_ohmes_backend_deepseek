"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";

export default function GudangInboundPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [showReceiving, setShowReceiving] = useState(false);

  const loadInventory = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/v1/tsg-inventory/available?limit=200", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); const items = (data.data ?? []).map((item: any) => ({ ...item, status: "AVAILABLE", id: item.inventoryId ?? item.id })); setInventory(items); }
    } catch {}
  };

  useEffect(() => { loadInventory(); }, []);
  const [receivingBoxes, setReceivingBoxes] = useState<Array<{ code: string; weight: string; type: string }>>([
    { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" },
  ]);
  const [saving, setSaving] = useState(false);
  const [receivingError, setReceivingError] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [editLocId, setEditLocId] = useState<string | null>(null);
  const [editLocValue, setEditLocValue] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("AVAILABLE");

  // Material & sparepart receiving
  const [showMaterialReceiving, setShowMaterialReceiving] = useState(false);
  const [matType, setMatType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [matItems, setMatItems] = useState<Array<{ itemId: string; qty: string; price: string }>>([{ itemId: "", qty: "", price: "" }]);
  const [matDocRef, setMatDocRef] = useState("");
  const [matNotes, setMatNotes] = useState("");
  const [matError, setMatError] = useState("");
  const [matSaving, setMatSaving] = useState(false);
  const [consumableList, setConsumableList] = useState<any[]>([]);
  const [sparepartList, setSparepartList] = useState<any[]>([]);

  const loadMaterialItems = async (type: "CONSUMABLE" | "SPAREPART") => {
    try {
      const token = localStorage.getItem("accessToken");
      const path = type === "CONSUMABLE" ? "/api/v1/consumable-items" : "/api/v1/spareparts";
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (type === "CONSUMABLE") setConsumableList(data.data ?? []);
        else setSparepartList(data.data ?? []);
      }
    } catch {}
  };

  const handleSaveMaterialReceiving = async () => {
    const validItems = matItems.filter((i) => i.itemId && parseFloat(i.qty) > 0);
    if (validItems.length === 0) { setMatError("Minimal 1 item dengan quantity > 0."); return; }
    if (!selectedSupplier) { setMatError("Pilih supplier dulu."); return; }
    setMatSaving(true);
    setMatError("");
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/v1/material-receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplierId: selectedSupplier,
          materialType: matType,
          supplierDocRef: matDocRef || undefined,
          notes: matNotes || undefined,
          items: validItems.map((i) => ({ itemId: i.itemId, quantity: parseFloat(i.qty), unitPrice: i.price ? parseFloat(i.price) : undefined })),
        }),
      });
      if (res.status === 401) { localStorage.removeItem("accessToken"); window.location.href = "/tablet/login"; throw new Error("Sesi berakhir"); }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "Gagal menyimpan"); }
      setShowMaterialReceiving(false);
    } catch (e: any) { setMatError(e.message); }
    finally { setMatSaving(false); }
  };

  const saveLocation = async (inventoryId: string) => {
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`/api/v1/tsg-inventory/${inventoryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locationCode: editLocValue }),
      });
      setEditLocId(null); loadInventory();
    } catch {}
  };

  const loadSuppliers = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/v1/tsg-suppliers", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setSuppliers(data.data ?? []); if (data.data?.length > 0) setSelectedSupplier(data.data[0].id); }
    } catch {}
  };

  const handleSaveReceiving = async () => {
    const validBoxes = receivingBoxes.filter(b => b.code && b.weight);
    if (validBoxes.length === 0) { setReceivingError("Minimal 1 boks dengan kode & berat."); return; }
    if (!selectedSupplier) { setReceivingError("Pilih supplier dulu."); return; }
    setSaving(true); setReceivingError("");
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/v1/tsg-receiving", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplierId: selectedSupplier,
          locationCode: locationCode || undefined,
          boxes: validBoxes.map(b => ({ boxCode: b.code, weightKg: parseFloat(b.weight), tsgType: b.type })),
        }),
      });
      if (res.status === 401) { localStorage.removeItem("accessToken"); window.location.href = "/tablet/login"; throw new Error("Sesi berakhir"); }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || "Gagal menyimpan"); }
      setShowReceiving(false);
      setReceivingBoxes([{ code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }]);
      loadInventory();
    } catch (e: any) { setReceivingError(e.message); }
    finally { setSaving(false); }
  };

  const filtered = inventory.filter((i) => filterStatus === "ALL" || i.status === filterStatus);

  const statusBadge = (status: string) => {
    const map: Record<string, "success" | "warning" | "info" | "error"> = {
      AVAILABLE: "success",
      ALLOCATED: "warning",
      USED: "info",
      WRITTEN_OFF: "error",
    };
    return <Badge variant={map[status] ?? "neutral"}>{status}</Badge>;
  };

  const ageBadge = (age: number) => {
    if (age > 30) return <Badge variant="error">{age} hari ⚠️</Badge>;
    if (age > 14) return <Badge variant="warning">{age} hari</Badge>;
    return <span className="text-sm text-gray-500">{age} hari</span>;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gudang Inbound</h1>
          <p className="text-lg text-gray-500 mt-1">
            Terima TSG dari supplier · Inventory FIFO
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/admin/labels">
            <Button size="xl" variant="outline">
              <Printer className="size-5 mr-2" /> Cetak Label
            </Button>
          </Link>
          <Button size="xl" onClick={() => { loadSuppliers(); setLocationCode(""); setReceivingBoxes([{ code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }]); setReceivingError(""); setShowReceiving(true); }}>
            🚛 Terima TSG Baru
          </Button>
          <Button size="xl" variant="outline" onClick={() => { loadSuppliers(); setMatType("CONSUMABLE"); setMatItems([{ itemId: "", qty: "", price: "" }]); setMatDocRef(""); setMatNotes(""); setMatError(""); setShowMaterialReceiving(true); }}>
            📦 Terima Material & Sparepart
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "AVAILABLE", count: inventory.filter((i) => i.status === "AVAILABLE").length, color: "text-green-700" },
          { label: "ALLOCATED", count: inventory.filter((i) => i.status === "ALLOCATED").length, color: "text-yellow-700" },
          { label: "USED", count: inventory.filter((i) => i.status === "USED").length, color: "text-blue-700" },
          { label: "TOTAL", count: inventory.length, color: "text-gray-700" },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["AVAILABLE", "ALLOCATED", "USED", "WRITTEN_OFF", "ALL"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Inventory Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode Boks</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Jenis</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Berat</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Umur</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Lokasi</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">Stok kosong. Terima TSG dulu dengan klik 🚛 Terima TSG Baru.</td></tr>
              ) : filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{item.boxCode}</td>
                  <td className="py-3"><Badge variant={item.tsgType === "REGULER" ? "info" : item.tsgType === "MILD" ? "success" : "warning"}>{item.tsgType ?? "REGULER"}</Badge></td>
                  <td className="py-3">{item.weightKg} kg</td>
                  <td className="py-3">{ageBadge(item.ageInDays)}</td>
                  <td className="py-3 text-sm text-gray-500">
                    {editLocId === item.id ? (
                      <div className="flex gap-1">
                        <input className="w-24 rounded border px-2 py-1 text-sm" value={editLocValue} onChange={e => setEditLocValue(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && saveLocation(item.id)} />
                        <button className="text-green-600 text-xs font-bold" onClick={() => saveLocation(item.id)}>✓</button>
                        <button className="text-red-400 text-xs" onClick={() => setEditLocId(null)}>✕</button>
                      </div>
                    ) : (
                      <span className="cursor-pointer hover:underline" onClick={() => { setEditLocId(item.id); setEditLocValue(item.locationCode ?? ""); }}>{item.locationCode ?? "Klik untuk isi"}</span>
                    )}
                  </td>
                  <td className="py-3">{statusBadge(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Receiving Dialog */}
      <Dialog
        open={showReceiving}
        onClose={() => setShowReceiving(false)}
        title="Terima TSG dari Supplier"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                {suppliers.length === 0 && <option value="">Memuat...</option>}
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <Input label="No Surat Jalan Supplier" placeholder="Opsional" />
            <Input label="Lokasi Rak" placeholder="RAK-A-01" value={locationCode} onChange={e => setLocationCode(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Daftar Boks</h3>
              <span className="text-sm text-gray-500">{receivingBoxes.length} boks</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {receivingBoxes.map((box, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                  <span className="w-8 text-center font-bold text-gray-400">{i + 1}</span>
                  <Input
                    value={box.code}
                    onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, code: e.target.value }; setReceivingBoxes(next); }}
                    placeholder={`TSG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`}
                    className="flex-1"
                  />
                  <Input type="number" value={box.weight} onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, weight: e.target.value }; setReceivingBoxes(next); }} placeholder="0.00" className="w-28" />
                  <select className="w-28 rounded-lg border border-gray-300 px-2 py-3 text-sm bg-white" value={box.type} onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, type: e.target.value }; setReceivingBoxes(next); }}>
                    <option value="REGULER">Reguler</option>
                    <option value="MILD">Mild</option>
                    <option value="PUTIHAN">Putihan</option>
                  </select>
                  {receivingBoxes.length > 1 && (
                    <button className="text-red-400 hover:text-red-600" onClick={() => setReceivingBoxes(receivingBoxes.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setReceivingBoxes([...receivingBoxes, { code: "", weight: "", type: "REGULER" }])}>
              + Tambah Boks
            </Button>
          </div>

          {receivingError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{receivingError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveReceiving} disabled={saving}>
            {saving ? "Menyimpan..." : `Simpan · ${receivingBoxes.filter(b => b.code && b.weight).length} Boks`}
          </Button>
        </div>
      </Dialog>

      {/* Material & Sparepart Receiving Dialog */}
      <Dialog
        open={showMaterialReceiving}
        onClose={() => setShowMaterialReceiving(false)}
        title="Terima Material & Sparepart"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          {/* Toggle jenis */}
          <div className="flex gap-2">
            {(["CONSUMABLE", "SPAREPART"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setMatType(t); setMatItems([{ itemId: "", qty: "", price: "" }]); loadMaterialItems(t); }}
                className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                  matType === t ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t === "CONSUMABLE" ? "🧵 Consumable (Bahan)" : "🔧 Sparepart (Suku Cadang)"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                {suppliers.length === 0 && <option value="">Memuat...</option>}
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <Input label="No Surat Jalan Supplier" value={matDocRef} onChange={e => setMatDocRef(e.target.value)} placeholder="Opsional" />
            <Input label="Catatan" value={matNotes} onChange={e => setMatNotes(e.target.value)} placeholder="Opsional" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Daftar Item</h3>
              <span className="text-sm text-gray-500">{matItems.length} item</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {matItems.map((item, i) => {
                const list = matType === "CONSUMABLE" ? consumableList : sparepartList;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                    <span className="w-8 text-center font-bold text-gray-400">{i + 1}</span>
                    <select
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-3 text-sm bg-white"
                      value={item.itemId}
                      onChange={e => { const next = [...matItems]; next[i] = { ...next[i]!, itemId: e.target.value }; setMatItems(next); }}
                    >
                      <option value="">Pilih {matType === "CONSUMABLE" ? "Item" : "Sparepart"}</option>
                      {list.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                    </select>
                    <Input
                      type="number"
                      value={item.qty}
                      onChange={e => { const next = [...matItems]; next[i] = { ...next[i]!, qty: e.target.value }; setMatItems(next); }}
                      placeholder="Qty"
                      className="w-24"
                    />
                    <Input
                      type="number"
                      value={item.price}
                      onChange={e => { const next = [...matItems]; next[i] = { ...next[i]!, price: e.target.value }; setMatItems(next); }}
                      placeholder="Harga/unit"
                      className="w-32"
                    />
                    {matItems.length > 1 && (
                      <button className="text-red-400 hover:text-red-600" onClick={() => setMatItems(matItems.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setMatItems([...matItems, { itemId: "", qty: "", price: "" }])}>
              + Tambah Item
            </Button>
          </div>

          {matError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{matError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveMaterialReceiving} disabled={matSaving}>
            {matSaving ? "Menyimpan..." : `Simpan · ${matItems.filter(i => i.itemId && parseFloat(i.qty) > 0).length} Item`}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
