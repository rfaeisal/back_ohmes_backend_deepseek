"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { UNIT_OPTIONS } from "@/lib/constants/units";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";

export default function MasterSparepartsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: "", name: "", unit: "unit", applicableMachines: "BOTH" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/spareparts");
      setItems(res.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm({ code: "", name: "", unit: "unit", applicableMachines: "BOTH" }); setShowForm(true); };
  const openEdit = (item: any) => { setEditing(item); setForm({ code: item.code, name: item.name, unit: item.unit ?? "unit", applicableMachines: item.applicableMachines ?? "BOTH" }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.unit) { setError("Kode, nama, dan unit wajib diisi."); return; }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await apiFetch(`/spareparts/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/spareparts", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus sparepart ini?")) return;
    try {
      await apiFetch(`/spareparts/${id}`, { method: "DELETE" });
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Master Sparepart</h1>
          <p className="text-gray-500">Suku cadang mesin — pisau, nylon, belt, dll</p>
        </div>
        <Button onClick={openAdd}>+ Tambah Sparepart</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <Card>
        <CardTitle>Daftar Sparepart ({items.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Nama</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Unit</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Berlaku Untuk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Belum ada sparepart.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{item.code}</td>
                  <td className="py-3 font-medium">{item.name}</td>
                  <td className="py-3 text-sm text-gray-500">{item.unit}</td>
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

      <Dialog open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit Sparepart" : "Tambah Sparepart"}>
        <div className="space-y-4">
          <Input label="Kode" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="sp_PISAU_FILTER" />
          <Input label="Nama" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Pisau Filter" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Berlaku untuk mesin</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.applicableMachines ?? "BOTH"} onChange={e => setForm({ ...form, applicableMachines: e.target.value })}>
              <option value="MAKER">MAKER</option>
              <option value="HLP">HLP</option>
              <option value="BOTH">MAKER & HLP (Keduanya)</option>
            </select>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
