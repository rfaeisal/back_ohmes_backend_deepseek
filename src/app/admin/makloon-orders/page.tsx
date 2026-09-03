"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

// =============================================================================
// Order Makloon — entitas order dari customer (docs/26 §2)
// =============================================================================

const FINAL_FORMS = [
  { v: "BATANGAN", label: "Batangan" },
  { v: "PACK", label: "Pack tanpa wrap" },
  { v: "PACK_WRAP", label: "Pack dengan wrap" },
  { v: "SLOP", label: "Slop (10 pack, wrap)" },
  { v: "BAL", label: "Bal (20 slop)" },
  { v: "CARTON_SLOP", label: "Karton isi 50 slop" },
  { v: "CARTON_BAL", label: "Karton isi 4 bal" },
];
const INPUT_TYPES = [
  { v: "BATANGAN", label: "Batangan" },
  { v: "TSG", label: "TSG" },
];
const STATUS_FLOW = ["OPEN", "RECEIVING", "PROCESSING", "DONE"] as const;

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Terima Order",
  RECEIVING: "Bahan Masuk",
  PROCESSING: "Diproses",
  DONE: "Selesai Serah Terima",
};

export default function MakloonOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer: "",
    productName: "",
    tsgType: "REGULER" as string,
    finalForm: "PACK" as string,
    inputType: "TSG" as string,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/makloon-orders");
      setOrders(data.data ?? []);
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.customer.trim() || !form.productName.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/makloon-orders", {
        method: "POST",
        body: JSON.stringify({
          customer: form.customer,
          productName: form.productName,
          tsgType: form.tsgType,
          finalForm: form.finalForm,
          inputType: form.inputType,
          notes: form.notes || undefined,
        }),
      });
      setShowForm(false);
      setForm({ customer: "", productName: "", tsgType: "REGULER", finalForm: "PACK", inputType: "TSG", notes: "" });
      load();
    } catch (err: any) {
      alert(err?.message ?? "Gagal menyimpan order.");
    } finally { setSaving(false); }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/makloon-orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (err: any) {
      alert(err?.message ?? "Gagal mengubah status.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Order Makloon</h1>
          <p className="text-gray-500">Pemesan, produk pesanan, satuan akhir & bahan baku masuk</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="size-4" /> Order Baru</Button>
      </div>

      <Card>
        <CardTitle>Daftar Order ({orders.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Pemesan</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Produk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Satuan Akhir</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Bahan Masuk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Memuat...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Belum ada order makloon.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-100">
                  <td className="py-3 font-mono text-sm">{o.code}</td>
                  <td className="py-3 text-sm font-medium">{o.customer}</td>
                  <td className="py-3 text-sm">
                    {o.productName}
                    <span className="ml-2 text-xs text-gray-500">({o.tsgType})</span>
                  </td>
                  <td className="py-3 text-sm">{FINAL_FORMS.find((f) => f.v === o.finalForm)?.label ?? o.finalForm}</td>
                  <td className="py-3 text-sm">{INPUT_TYPES.find((f) => f.v === o.inputType)?.label ?? o.inputType}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          o.status === "DONE" ? "success"
                            : o.status === "PROCESSING" ? "info"
                              : o.status === "RECEIVING" ? "warning"
                                : "neutral"
                        }
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                      <select
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs bg-white"
                        value={o.status}
                        onChange={(e) => handleStatus(o.id, e.target.value)}
                      >
                        {STATUS_FLOW.map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onClose={() => setShowForm(false)} title="Order Makloon Baru">
        <div className="space-y-4">
          <Input label="Pemesan" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="PT. A" />
          <Input label="Nama Produk" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="Marbol - Putihan" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jenis TSG</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.tsgType} onChange={(e) => setForm({ ...form, tsgType: e.target.value })}>
              <option value="REGULER">REGULER</option>
              <option value="MILD">MILD</option>
              <option value="PUTIHAN">PUTIHAN</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Satuan Produk Akhir</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.finalForm} onChange={(e) => setForm({ ...form, finalForm: e.target.value })}>
              {FINAL_FORMS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bahan Baku Masuk</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={form.inputType} onChange={(e) => setForm({ ...form, inputType: e.target.value })}>
              {INPUT_TYPES.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
            </select>
          </div>
          <Input label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" />
          <Button className="w-full" onClick={handleSave} disabled={saving || !form.customer.trim() || !form.productName.trim()}>
            {saving ? "Menyimpan..." : "Simpan Order"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
