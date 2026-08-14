"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

export default function DispatchPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Form create order
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    customerAddress: "",
    customerContact: "",
    driverName: "",
    vehicleNo: "",
    notes: "",
  });
  const [selectedCartons, setSelectedCartons] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([
        apiFetch("/dispatch/orders"),
        apiFetch("/cartons"),
      ]);
      setOrders(o.data ?? []);
      setCartons(c.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const readyCartons = cartons.filter((c) => c.status === "READY");

  const handleCreateOrder = async () => {
    if (!form.customerName || !form.customerAddress) { setMsg("Nama & alamat pelanggan wajib."); return; }
    if (selectedCartons.size === 0) { setMsg("Pilih minimal 1 karton READY."); return; }
    try {
      await apiFetch("/dispatch/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          customerContact: form.customerContact || undefined,
          driverName: form.driverName || undefined,
          vehicleNo: form.vehicleNo || undefined,
          notes: form.notes || undefined,
          cartonIds: Array.from(selectedCartons),
        }),
      });
      setShowNew(false);
      setSelectedCartons(new Set());
      setMsg("✅ Dispatch order dibuat.");
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleDispatch = async (orderId: string) => {
    if (!confirm("Dispatch order ini? Truk berangkat.")) return;
    try {
      await apiFetch(`/dispatch/orders/${orderId}/dispatch`, { method: "POST", body: JSON.stringify({}) });
      setMsg("✅ Order DISPATCHED.");
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleDocument = async (orderId: string) => {
    try {
      const doc = await apiFetch(`/dispatch/orders/${orderId}/document`, { method: "POST", body: JSON.stringify({}) });
      setMsg(`✅ Dokumen dibuat: ${doc.documentNumber ?? doc.id ?? ""}`);
    } catch (e: any) { setMsg(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data dispatch...</div>;

  const statusBadge = (s: string) => {
    if (s === "DISPATCHED") return <Badge variant="success">DISPATCHED</Badge>;
    if (s === "PENDING") return <Badge variant="warning">PENDING</Badge>;
    return <Badge variant="neutral">{s}</Badge>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dispatch / Pengiriman</h1>
          <p className="text-gray-500">Order pengiriman karton ke distributor</p>
        </div>
        <Button onClick={() => { setShowNew(true); setSelectedCartons(new Set()); }}>
          🚚 Buat Dispatch Order
        </Button>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg} <button onClick={() => setMsg("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Total Order</p><p className="text-3xl font-bold text-blue-700">{orders.length}</p></Card>
        <Card><p className="text-xs text-gray-500">Karton READY</p><p className="text-3xl font-bold text-green-700">{readyCartons.length}</p></Card>
        <Card><p className="text-xs text-gray-500">Sudah Dispatch</p><p className="text-3xl font-bold text-primary-700">{orders.filter((o) => o.status === "DISPATCHED").length}</p></Card>
      </div>

      <Card>
        <CardTitle>Dispatch Orders ({orders.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Pelanggan</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tujuan</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Karton</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Sopir</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Belum ada dispatch order.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-100">
                  <td className="py-3 font-mono text-sm">{o.orderCode ?? o.id.slice(0, 8)}</td>
                  <td className="py-3 font-medium">{o.customerName}</td>
                  <td className="py-3 text-sm text-gray-500">{o.customerAddress}</td>
                  <td className="py-3 text-sm">{o.items?.length ?? "-"}</td>
                  <td className="py-3 text-sm text-gray-500">{o.driverName ?? "-"} {o.vehicleNo ? `(${o.vehicleNo})` : ""}</td>
                  <td className="py-3">{statusBadge(o.status)}</td>
                  <td className="py-3 flex gap-2">
                    {o.status !== "DISPATCHED" && (
                      <Button size="sm" variant="primary" onClick={() => handleDispatch(o.id)}>Dispatch</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleDocument(o.id)}>📄 Dokumen</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialog buat order */}
      <Dialog open={showNew} onClose={() => setShowNew(false)} title="Buat Dispatch Order" className="max-w-3xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nama Pelanggan *" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="cth: Distributor Surabaya" />
            <Input label="Alamat Tujuan *" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} placeholder="cth: Jl. X No. 1, Surabaya" />
            <Input label="Kontak" value={form.customerContact} onChange={(e) => setForm({ ...form, customerContact: e.target.value })} placeholder="cth: 0812..." />
            <Input label="Sopir" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} placeholder="cth: Pak Slamet" />
            <Input label="No Kendaraan" value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} placeholder="cth: L 1234 AB" />
            <Input label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" />
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Pilih Karton (READY):</p>
            {readyCartons.length === 0 ? (
              <p className="text-sm text-gray-400">Tidak ada karton READY. Tutup karton di halaman Gudang Outbound dulu.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {readyCartons.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 rounded border border-gray-200 p-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedCartons.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(selectedCartons);
                        if (e.target.checked) next.add(c.id); else next.delete(c.id);
                        setSelectedCartons(next);
                      }}
                      className="size-4"
                    />
                    <span className="font-mono text-sm">{c.code}</span>
                    <span className="text-sm text-gray-500">{c.actualPackCount} pack</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={handleCreateOrder}>Buat Order</Button>
        </div>
      </Dialog>
    </div>
  );
}
