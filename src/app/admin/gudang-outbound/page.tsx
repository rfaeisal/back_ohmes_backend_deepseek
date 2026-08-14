"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

export default function GudangOutboundPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [cartons, setCartons] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Form create carton
  const [showNewCarton, setShowNewCarton] = useState(false);
  const [newCartonProduct, setNewCartonProduct] = useState("");
  const [newCartonCapacity, setNewCartonCapacity] = useState("50");

  // Form confirm finished goods
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmShiftId, setConfirmShiftId] = useState("");
  const [confirmPacks, setConfirmPacks] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, p] = await Promise.all([
        apiFetch("/shifts?status=APPROVED&limit=20"),
        apiFetch("/cartons"),
        apiFetch("/products"),
      ]);
      setShifts(s.data ?? []);
      setCartons(c.data ?? []);
      setProducts(p.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateCarton = async () => {
    if (!newCartonProduct) { setMsg("Pilih produk."); return; }
    try {
      await apiFetch("/cartons", {
        method: "POST",
        body: JSON.stringify({ productId: newCartonProduct, capacityPack: parseInt(newCartonCapacity) || 50 }),
      });
      setShowNewCarton(false);
      setMsg("✅ Karton baru dibuat.");
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleCloseCarton = async (cartonId: string) => {
    if (!confirm("Tutup karton ini? Status jadi READY.")) return;
    try {
      await apiFetch(`/cartons/${cartonId}/close`, { method: "POST", body: JSON.stringify({}) });
      setMsg("✅ Karton ditutup (READY).");
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  const handleConfirmFG = async () => {
    if (!confirmPacks) { setMsg("Isi jumlah pack aktual."); return; }
    try {
      await apiFetch(`/finished-goods/${confirmShiftId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ packsActualCount: parseInt(confirmPacks) }),
      });
      setShowConfirm(false);
      setMsg("✅ Finished goods dikonfirmasi.");
      load();
    } catch (e: any) { setMsg(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data outbound...</div>;

  const openCartons = cartons.filter((c) => c.status === "OPEN");
  const readyCartons = cartons.filter((c) => c.status === "READY");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gudang Outbound</h1>
          <p className="text-gray-500">Finished goods &amp; kartoning</p>
        </div>
        <Button onClick={() => { setNewCartonProduct(products[0]?.id ?? ""); setNewCartonCapacity("50"); setShowNewCarton(true); }}>
          📦 Buat Karton Baru
        </Button>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg} <button onClick={() => setMsg("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Karton OPEN</p><p className="text-3xl font-bold text-blue-700">{openCartons.length}</p></Card>
        <Card><p className="text-xs text-gray-500">Karton READY</p><p className="text-3xl font-bold text-green-700">{readyCartons.length}</p></Card>
        <Card><p className="text-xs text-gray-500">Shift Approved</p><p className="text-3xl font-bold text-gray-700">{shifts.length}</p></Card>
      </div>

      {/* Finished goods — shift approved */}
      <Card className="mb-6">
        <CardTitle>Finished Goods — Shift Approved ({shifts.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Shift</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Boks</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Yield</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Belum ada shift APPROVED.</td></tr>
              ) : shifts.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-3 text-sm font-mono">{s.reportDate}</td>
                  <td className="py-3 text-sm font-mono">{s.id.slice(0, 8)}...</td>
                  <td className="py-3 text-sm text-right">{s.boxesCount ?? 0}</td>
                  <td className="py-3 text-right">
                    {s.yieldPct != null ? (
                      <Badge variant={s.yieldPct >= 110 && s.yieldPct <= 114 ? "success" : "error"}>{s.yieldPct}%</Badge>
                    ) : "-"}
                  </td>
                  <td className="py-3">
                    <Button size="sm" variant="outline" onClick={() => { setConfirmShiftId(s.id); setConfirmPacks(""); setShowConfirm(true); }}>
                      ✅ Konfirmasi FG
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Kartoning */}
      <Card>
        <CardTitle>Karton ({cartons.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Produk</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Kapasitas</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Pack Terisi</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {cartons.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Belum ada karton. Klik "Buat Karton Baru".</td></tr>
              ) : cartons.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-3 font-mono text-sm">{c.code}</td>
                  <td className="py-3 text-sm">{products.find((p) => p.id === c.productId)?.code ?? "-"}</td>
                  <td className="py-3 text-sm text-right">{c.capacityPack}</td>
                  <td className="py-3 text-sm text-right">{c.actualPackCount}</td>
                  <td className="py-3">
                    <Badge variant={c.status === "OPEN" ? "info" : c.status === "READY" ? "success" : "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="py-3 flex gap-2">
                    {c.status === "OPEN" && (
                      <Button size="sm" variant="primary" onClick={() => handleCloseCarton(c.id)}>Tutup → READY</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialog buat karton */}
      <Dialog open={showNewCarton} onClose={() => setShowNewCarton(false)} title="Buat Karton Baru">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produk</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={newCartonProduct} onChange={(e) => setNewCartonProduct(e.target.value)}>
              {products.map((p: any) => <option key={p.id} value={p.id}>{p.brand} {p.code}</option>)}
            </select>
          </div>
          <Input label="Kapasitas (pack)" type="number" value={newCartonCapacity} onChange={(e) => setNewCartonCapacity(e.target.value)} />
          <Button className="w-full" onClick={handleCreateCarton}>Buat Karton</Button>
        </div>
      </Dialog>

      {/* Dialog konfirmasi FG */}
      <Dialog open={showConfirm} onClose={() => setShowConfirm(false)} title="Konfirmasi Finished Goods">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Jumlah pack aktual diterima dari HLP untuk shift ini.</p>
          <Input label="Jumlah Pack Aktual" type="number" value={confirmPacks} onChange={(e) => setConfirmPacks(e.target.value)} placeholder="cth: 25" autoFocus />
          <Button className="w-full" onClick={handleConfirmFG}>Konfirmasi</Button>
        </div>
      </Dialog>
    </div>
  );
}
