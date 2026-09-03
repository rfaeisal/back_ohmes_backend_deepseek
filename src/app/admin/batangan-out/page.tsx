"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageOpen } from "lucide-react";

// =============================================================================
// Batangan Keluar — produk final #1 (docs/26 §6)
// =============================================================================
// Batangan keluar untuk INTERNAL (antar pabrik / keperluan pabrik) dan
// MAKLOON (order PT. B — batch makloon mewarisi order + customer otomatis).
// =============================================================================

export default function BatanganOutPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [outs, setOuts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    batchId: "",
    qtyKg: "",
    batangEst: "",
    destinationType: "INTERNAL" as string,
    destinationName: "",
    docRef: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, o] = await Promise.all([apiFetch("/batches"), apiFetch("/batangan-out")]);
      setBatches(b.data ?? []);
      setOuts(o.data ?? []);
    } catch { setBatches([]); setOuts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedBatch = batches.find((b: any) => b.id === form.batchId);

  const handleSave = async () => {
    if (!form.batchId) { alert("Pilih batch."); return; }
    if (!form.qtyKg || Number(form.qtyKg) <= 0) { alert("Isi berat keluar (kg)."); return; }
    setSaving(true);
    try {
      await apiFetch("/batangan-out", {
        method: "POST",
        body: JSON.stringify({
          batchId: form.batchId,
          qtyKg: Number(form.qtyKg),
          batangEst: form.batangEst ? Number(form.batangEst) : undefined,
          destinationType: form.destinationType,
          destinationName: form.destinationName || undefined,
          docRef: form.docRef || undefined,
          notes: form.notes || undefined,
        }),
      });
      setForm({ batchId: "", qtyKg: "", batangEst: "", destinationType: "INTERNAL", destinationName: "", docRef: "", notes: "" });
      load();
    } catch (err: any) {
      alert(err?.message ?? "Gagal mencatat batangan keluar.");
    } finally { setSaving(false); }
  };

  const destLabel = (t: string) =>
    t === "MAKLOON" ? "Makloon" : t === "INTERNAL" ? "Internal" : "Lainnya";

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Batangan Keluar</h1>
          <p className="text-gray-500">Produk final batangan — internal & order makloon</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card>
          <CardTitle><span className="flex items-center gap-2"><PackageOpen className="size-5" /> Catat Keluar</span></CardTitle>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch Batangan</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
                value={form.batchId}
                onChange={(e) => {
                  const b = batches.find((x: any) => x.id === e.target.value);
                  setForm({
                    ...form,
                    batchId: e.target.value,
                    destinationType: b?.makloonCustomer ? "MAKLOON" : form.destinationType,
                    destinationName: b?.makloonCustomer ?? "",
                  });
                }}
              >
                <option value="">— Pilih batch —</option>
                {batches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.batanganKg} kg{b.makloonCustomer ? ` · makloon ${b.makloonCustomer}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedBatch?.makloonCustomer ? (
              <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                Batch makloon — tujuan otomatis <strong>{selectedBatch.makloonCustomer}</strong> (serah terima ke pemesan).
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tujuan</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
                    value={form.destinationType}
                    onChange={(e) => setForm({ ...form, destinationType: e.target.value })}
                  >
                    <option value="INTERNAL">Internal (antar pabrik / keperluan pabrik)</option>
                    <option value="LAIN">Lainnya</option>
                  </select>
                </div>
                <Input
                  label="Nama Tujuan"
                  value={form.destinationName}
                  onChange={(e) => setForm({ ...form, destinationName: e.target.value })}
                  placeholder="Pabrik Pamekasan / …"
                />
              </>
            )}
            <Input label="Berat Keluar (kg)" type="number" step="0.01" value={form.qtyKg} onChange={(e) => setForm({ ...form, qtyKg: e.target.value })} placeholder="0.00" />
            <Input label="Estimasi Jumlah Batang (opsional)" type="number" value={form.batangEst} onChange={(e) => setForm({ ...form, batangEst: e.target.value })} placeholder="Opsional" />
            <Input label="No. Dokumen (opsional)" value={form.docRef} onChange={(e) => setForm({ ...form, docRef: e.target.value })} placeholder="Opsional" />
            <Input label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" />
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Batangan Keluar"}
            </Button>
          </div>
        </Card>

        {/* Riwayat */}
        <div className="lg:col-span-2">
          <Card>
            <CardTitle>Riwayat Keluar ({outs.length})</CardTitle>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Waktu</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Batch</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Tujuan</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Berat</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Petugas</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="py-6 text-center text-gray-400">Memuat...</td></tr>
                  ) : outs.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-gray-400">Belum ada batangan keluar.</td></tr>
                  ) : outs.map((o) => (
                    <tr key={o.id} className="border-b border-gray-100">
                      <td className="py-3 text-sm">{new Date(o.outAt).toLocaleString("id-ID")}</td>
                      <td className="py-3 font-mono text-sm">{o.batchCode}</td>
                      <td className="py-3 text-sm">
                        {o.destinationName}
                        <span className="ml-2"><Badge variant={o.destinationType === "MAKLOON" ? "warning" : "neutral"}>{destLabel(o.destinationType)}</Badge></span>
                        {o.orderCode ? <span className="ml-1 text-xs text-gray-500">{o.orderCode}</span> : null}
                      </td>
                      <td className="py-3 font-mono">{o.qtyKg} kg{o.batangEst ? ` (±${o.batangEst} btg)` : ""}</td>
                      <td className="py-3 text-sm text-gray-500">{o.outByName ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
