"use client";
import { apiFetch } from "@/lib/utils/api-client";
import {
  APPLICABLE_MACHINE_OPTIONS,
  parseApplicableMachines,
  joinApplicableMachines,
} from "@/lib/utils";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { UNIT_OPTIONS } from "@/lib/constants/units";
import { Pencil, Trash2 } from "lucide-react";

export default function MasterConsumablesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: "", name: "", unit: "roll", productId: "", allowAtEndShift: false, applicableMachines: "BOTH" as string });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, p] = await Promise.allSettled([
        apiFetch("/consumable-items"),
        apiFetch("/products"),
      ]);
      if (c.status === "fulfilled") setItems(c.value.data ?? []);
      if (p.status === "fulfilled") setProducts(p.value.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm({ code: "", name: "", unit: "roll", productId: products[0]?.id ?? "", allowAtEndShift: false, applicableMachines: "BOTH" }); setShowForm(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ code: item.code, name: item.name, unit: item.unit ?? "roll", productId: item.productId ?? "", allowAtEndShift: item.allowAtEndShift ?? false, applicableMachines: item.applicableMachines ?? "BOTH" }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.unit) { setError("Kode, nama, dan unit wajib diisi."); return; }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await apiFetch(`/consumable-items/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/consumable-items", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus item ini?")) return;
    try {
      await apiFetch(`/consumable-items/${id}`, { method: "DELETE" });
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Master Consumable Item</h1>
          <p className="text-gray-500">Material bahan pendukung rokok — bobbin, filter, tipping, lem</p>
        </div>
        <Button onClick={openAdd}>+ Tambah Item</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardTitle>Daftar Consumable Item ({items.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Nama</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Unit</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Produk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Akhir Shift</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Berlaku Untuk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Belum ada item.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{item.code}</td>
                  <td className="py-3 font-medium">{item.name}</td>
                  <td className="py-3 text-sm text-gray-500">{item.unit}</td>
                  <td className="py-3 text-sm text-gray-500">{products.find((p) => p.id === item.productId)?.code ?? "-"}</td>
                  <td className="py-3">
                    {item.allowAtEndShift ? (
                      <Badge variant="success">✓ Boleh</Badge>
                    ) : (
                      <Badge variant="neutral">—</Badge>
                    )}
                  </td>
                  <td className="py-3"><Badge variant={item.applicableMachines === "BOTH" ? "info" : "warning"}>{item.applicableMachines ?? "BOTH"}</Badge></td>
                  <td className="py-3 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit Item" : "Tambah Item"}>
        <div className="space-y-4">
          <Input label="Kode" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="item_BOBIN_BLK" />
          <Input label="Nama" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Bobbin Hummer" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produk (opsional)</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>
              <option value="">Semua Produk</option>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.brand} {p.code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Berlaku untuk mesin</label>
            <div className="flex flex-wrap gap-2">
              {APPLICABLE_MACHINE_OPTIONS.map((m) => (
                <label key={m} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parseApplicableMachines(form.applicableMachines).includes(m)}
                    onChange={() => {
                      const cur = new Set(parseApplicableMachines(form.applicableMachines));
                      if (cur.has(m)) cur.delete(m);
                      else cur.add(m);
                      setForm({ ...form, applicableMachines: joinApplicableMachines(APPLICABLE_MACHINE_OPTIONS.filter((o) => cur.has(o))) });
                    }}
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.allowAtEndShift}
              onChange={(e) => setForm({ ...form, allowAtEndShift: e.target.checked })}
              className="size-4"
            />
            📦 Boleh ditambahkan saat Akhiri Shift
          </label>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
