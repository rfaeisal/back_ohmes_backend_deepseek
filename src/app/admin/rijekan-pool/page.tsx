"use client";
import { apiFetch, getToken } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Recycle, PackageCheck } from "lucide-react";

// =============================================================================
// Pool Rijekan — rijek terkumpul siap proses (docs/26 §3–5)
// =============================================================================
// INTERNAL: kelompok per (jenis × satuan) → "Proses Rijek → TSG" (reproses,
// berat rijekan sebagai acuan + timbang aktual).
// MAKLOON: kelompok per order → "Serah Terima" ke customer + PDF berita acara.
// =============================================================================

interface PoolGroup {
  origin: "INTERNAL" | "MAKLOON";
  tsgType: string | null;
  unit: string;
  makloonOrderId: string | null;
  makloonCustomer: string | null;
  availableQty: number;
}
interface PoolLot {
  id: string;
  entryType: string;
  unit: string;
  tsgType: string | null;
  origin: "INTERNAL" | "MAKLOON";
  makloonOrderId: string | null;
  originalQty: number;
  allocatedQty: number;
  returnedQty: number;
  availableQty: number;
  createdAt: string;
}

export default function RijekanPoolPage() {
  const [groups, setGroups] = useState<PoolGroup[]>([]);
  const [lots, setLots] = useState<PoolLot[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog reproses
  const [reprosesTsg, setReprosesTsg] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState<Record<string, number>>({});
  const [weightKg, setWeightKg] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/rijekan");
      setGroups(data.pool?.groups ?? []);
      setLots(data.pool?.lots ?? []);
      const ordersData = await apiFetch("/makloon-orders");
      setOrders(ordersData.data ?? []);
    } catch {
      setGroups([]); setLots([]); setOrders([]);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const internalGroups = groups.filter((g) => g.origin === "INTERNAL");
  const internalJenis = [...new Set(internalGroups.map((g) => g.tsgType).filter(Boolean))] as string[];

  // Kelompok makloon per order
  const makloonGroups = groups.filter((g) => g.origin === "MAKLOON");
  const makloonByOrder = new Map<string, { customer: string | null; code: string; product: string; groups: PoolGroup[] }>();
  for (const g of makloonGroups) {
    if (!g.makloonOrderId) continue;
    const order = orders.find((o) => o.id === g.makloonOrderId);
    if (!makloonByOrder.has(g.makloonOrderId)) {
      makloonByOrder.set(g.makloonOrderId, {
        customer: g.makloonCustomer,
        code: order?.code ?? "-",
        product: order?.productName ?? "-",
        groups: [],
      });
    }
    makloonByOrder.get(g.makloonOrderId)!.groups.push(g);
  }

  const openReproses = (tsg: string) => {
    setReprosesTsg(tsg);
    const map: Record<string, number> = {};
    for (const l of lots.filter((l) => l.origin === "INTERNAL" && l.tsgType === tsg && l.availableQty > 0.001)) {
      map[l.id] = l.availableQty; // default: habiskan lot
    }
    setQtyInput(map);
    setWeightKg("");
    setNote("");
  };

  const acuanTotal = Object.entries(qtyInput).reduce((acc, [id, qty]) => {
    const lot = lots.find((l) => l.id === id);
    if (!lot) return acc;
    acc[lot.unit] = (acc[lot.unit] ?? 0) + qty;
    return acc;
  }, {} as Record<string, number>);

  const doReproses = async () => {
    const selected = Object.entries(qtyInput)
      .filter(([, qty]) => qty > 0)
      .map(([ledgerEntryId, qty]) => ({ ledgerEntryId, qty }));
    if (selected.length === 0) { alert("Pilih minimal satu lot."); return; }
    if (!weightKg || Number(weightKg) <= 0) { alert("Isi berat timbang aktual."); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/rijekan/reproses", {
        method: "POST",
        body: JSON.stringify({ tsgType: reprosesTsg, lots: selected, weightKg: Number(weightKg), note: note || undefined }),
      });
      alert(
        `Reproses berhasil!\n\nReceiving: ${res.receivingCode}\nBerat timbang: ${res.weightKg} kg\nBerat acuan rijekan: ${Object.entries(res.beratAcuan).map(([u, q]) => `${q} ${u}`).join(", ")}\n\nTSG ${res.tsgType} masuk inventory AVAILABLE.`
      );
      setReprosesTsg(null);
      load();
    } catch (err: any) {
      alert(err?.message ?? "Gagal memproses rijekan.");
    } finally { setBusy(false); }
  };

  const doReturn = async (orderId: string) => {
    if (!confirm("Serah terima SEMUA waste makloon tersisa dari order ini ke customer?")) return;
    setBusy(true);
    try {
      const res = await apiFetch("/rijekan/return", { method: "POST", body: JSON.stringify({ makloonOrderId: orderId }) });
      load();
      // Buka dokumen berita acara (pola gotcha #14: fetch blob + window.open)
      const token = getToken();
      const pdfRes = await fetch(`/api/v1/rijekan-returns/${res.returnId}/document`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await pdfRes.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err: any) {
      alert(err?.message ?? "Gagal mencatat serah terima.");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pool Rijekan</h1>
          <p className="text-gray-500">Rijek terkumpul per jenis & asal — dasar memulai reproses jadi TSG</p>
        </div>
        <Button variant="outline" onClick={load}>Muat Ulang</Button>
      </div>

      {/* Internal — reproses */}
      <Card>
        <CardTitle><span className="flex items-center gap-2"><Recycle className="size-5" /> Rijek Internal — Siap Reproses</span></CardTitle>
        <p className="mt-2 text-sm text-gray-500">
          Diproses per kelompok jenis yang sama → menghasilkan TSG jenis yang sama. Berat rijekan = acuan; berat TSG baru = timbang saat pembentukan.
        </p>
        {loading ? (
          <p className="py-6 text-center text-gray-400">Memuat...</p>
        ) : internalGroups.length === 0 ? (
          <p className="py-6 text-center text-gray-400">Belum ada rijek internal terkumpul.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Jenis TSG</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Satuan</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Tersedia</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {internalGroups.map((g) => (
                  <tr key={`${g.tsgType}-${g.unit}`} className="border-b border-gray-100">
                    <td className="py-3 font-medium">{g.tsgType ?? "-"}</td>
                    <td className="py-3 text-sm">{g.unit}</td>
                    <td className="py-3 font-mono">{g.availableQty}</td>
                    <td className="py-3">
                      {g.unit === "KG" ? (
                        <Button size="sm" onClick={() => openReproses(g.tsgType!)}>Proses Rijek → TSG</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {internalJenis.length === 0 && (
              <p className="py-3 text-xs text-gray-400">Tombol proses muncul pada kelompok satuan KG — lot BATANG/PACK/SLOP/BAL ikut dipilih di dialog yang sama.</p>
            )}
          </div>
        )}
      </Card>

      {/* Makloon — serah terima */}
      <div className="mt-6">
        <Card>
          <CardTitle><span className="flex items-center gap-2"><PackageCheck className="size-5" /> Waste Makloon — Serah Terima ke Customer</span></CardTitle>
          <p className="mt-2 text-sm text-gray-500">Waste dari TSG makloon wajib dikembalikan ke pemesan (per order) dengan berita acara.</p>
          {loading ? (
            <p className="py-6 text-center text-gray-400">Memuat...</p>
          ) : makloonByOrder.size === 0 ? (
            <p className="py-6 text-center text-gray-400">Belum ada waste makloon terkumpul.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Order</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Pemesan</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Produk</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Waste Terkumpul</th>
                    <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...makloonByOrder.entries()].map(([orderId, info]) => (
                    <tr key={orderId} className="border-b border-gray-100">
                      <td className="py-3 font-mono text-sm">{info.code}</td>
                      <td className="py-3 font-medium">{info.customer ?? "-"}</td>
                      <td className="py-3 text-sm">{info.product}</td>
                      <td className="py-3 text-sm">
                        {info.groups.map((g) => (
                          <span key={g.unit} className="mr-3">
                            {g.availableQty} {g.unit}
                            <span className="ml-1 text-xs text-gray-400">{g.tsgType ?? ""}</span>
                          </span>
                        ))}
                      </td>
                      <td className="py-3">
                        <Button size="sm" disabled={busy} onClick={() => doReturn(orderId)}>
                          Serah Terima + BA
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Dialog reproses */}
      <Dialog open={!!reprosesTsg} onClose={() => setReprosesTsg(null)} title={`Proses Rijek → TSG ${reprosesTsg ?? ""}`}>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-gray-500">Pilih lot (jenis sama) — berat/angka rijekan sebagai acuan:</p>
          {lots
            .filter((l) => l.origin === "INTERNAL" && l.tsgType === reprosesTsg && l.availableQty > 0.001)
            .map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                <div className="flex-1 text-sm">
                  <div className="font-medium">{l.unit} · {l.entryType === "IN_MAKER_WASTE" ? "Rijekan" : l.entryType === "IN_MAKER_MENIR" ? "Menir" : l.entryType === "IN_HLP_REJECT" ? "Reject HLP" : "Reject Stage"}</div>
                  <div className="text-xs text-gray-500">Tersedia {l.availableQty} · {new Date(l.createdAt).toLocaleDateString("id-ID")}</div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={l.availableQty}
                  step="any"
                  className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white"
                  value={qtyInput[l.id] ?? 0}
                  onChange={(e) => setQtyInput({ ...qtyInput, [l.id]: Number(e.target.value) })}
                />
                <span className="text-xs text-gray-400">{l.unit}</span>
              </div>
            ))}
          {lots.filter((l) => l.origin === "INTERNAL" && l.tsgType === reprosesTsg && l.availableQty > 0.001).length === 0 && (
            <p className="text-center text-gray-400 py-4">Tidak ada lot tersedia untuk jenis ini.</p>
          )}

          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <span className="font-medium">Berat acuan rijekan:</span>{" "}
            {Object.entries(acuanTotal).length === 0 ? "-" : Object.entries(acuanTotal).map(([u, q]) => `${q} ${u}`).join(", ")}
          </div>

          <Input
            label="Berat timbang TSG baru (kg)"
            type="number"
            step="0.01"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="Berat aktual hasil pembentukan (kg)"
          />
          <Input label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
          <Button className="w-full" onClick={doReproses} disabled={busy}>
            {busy ? "Memproses..." : "Proses → TSG Baru"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
