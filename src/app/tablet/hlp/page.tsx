"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// =============================================================================
// HLP — Catat hasil packing boks batangan dari mesin Maker
// =============================================================================

interface BatchItem {
  id: string;
  code: string;
  batanganKg: number;
  machineCode: string;
  createdAt: string;
  packCount?: number;
  packedBatang?: number;
}

export default function HlpPage() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [hlpMachines, setHlpMachines] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [bRes, mRes, hRes] = await Promise.allSettled([
        apiFetch("/batches"),
        apiFetch("/machines"),
        apiFetch("/hlp/packs"),
      ]);
      if (bRes.status === "fulfilled") {
        setBatches((bRes.value.data ?? []).map((b: any) => ({
          id: b.id,
          code: b.code,
          batanganKg: parseFloat(b.batanganKg ?? "0"),
          machineCode: b.machineCode ?? "-",
          createdAt: b.createdAt,
          packCount: b.packCount ?? 0,
          packedBatang: b.packedBatang ?? 0,
        })));
      }
      if (mRes.status === "fulfilled") {
        // Hanya mesin HLP
        setHlpMachines((mRes.value.data ?? []).filter((m: any) => m.type === "HLP"));
      }
      if (hRes.status === "fulfilled") setHistory(hRes.value.data ?? []);
    } catch { /* biarkan kosong */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Form state
  const [batchSearch, setBatchSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [hlpMachineId, setHlpMachineId] = useState("");

  // Bahan yang sudah dikeluarkan gudang ke mesin HLP terpilih (backlog
  // HLP material: gudang input, operator lihat read-only)
  const [machineMaterials, setMachineMaterials] = useState<any[]>([]);
  const loadMachineMaterials = useCallback(async (machineId: string) => {
    try {
      const res = await apiFetch(`/material-out?machineId=${machineId}&outType=PEMAKAIAN`);
      setMachineMaterials(res.data ?? []);
    } catch { setMachineMaterials([]); }
  }, []);

  useEffect(() => {
    if (hlpMachineId) loadMachineMaterials(hlpMachineId);
    else setMachineMaterials([]);
  }, [hlpMachineId, loadMachineMaterials]);
  const [packsLolos, setPacksLolos] = useState("");
  const [isiPerPack, setIsiPerPack] = useState("20");
  const [rejectBatangan, setRejectBatangan] = useState("0");
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);

  const filteredBatches = batches
    .filter((b) => b.code.toLowerCase().includes(batchSearch.toLowerCase()))
    .sort((a, b) => (a.packCount ?? 0) - (b.packCount ?? 0)); // belum packing di atas

  // Preview perhitungan
  const totalBatang = (parseInt(packsLolos || "0", 10) || 0) * (parseInt(isiPerPack || "0", 10) || 0) + (parseInt(rejectBatangan || "0", 10) || 0);
  const beratPerBatangPreview = selectedBatch && totalBatang > 0
    ? Math.round(((selectedBatch.batanganKg * 1000) / totalBatang) * 1000) / 1000
    : null;

  const handleSubmit = async () => {
    if (!selectedBatch) { setActionMsg("Pilih boks batangan (batch) dulu."); return; }
    if (!hlpMachineId) { setActionMsg("Pilih mesin HLP."); return; }
    const packs = parseInt(packsLolos, 10);
    if (isNaN(packs) || packs < 0) { setActionMsg("Isi jumlah pack lolos (boleh 0)."); return; }
    const isi = parseInt(isiPerPack, 10);
    if (isNaN(isi) || isi <= 0) { setActionMsg("Isi per pack harus > 0."); return; }
    const reject = parseInt(rejectBatangan || "0", 10) || 0;

    setSaving(true);
    setActionMsg("");
    try {
      const result = await apiFetch("/hlp/pack", {
        method: "POST",
        body: JSON.stringify({
          batchId: selectedBatch.id,
          hlpMachineId,
          packsLolos: packs,
          isiPerPack: isi,
          rejectBatangan: reject,
        }),
      });
      setLastResult(result);
      setActionMsg(`✅ Packing dicatat — berat per batang ${Number(result.beratPerBatangGram).toFixed(2)} g/batang`);
      setPacksLolos("");
      setRejectBatangan("0");
      setSelectedBatch(null);
      setBatchSearch("");
      load();
      loadMachineMaterials(hlpMachineId);
    } catch (e: any) {
      setActionMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mesin HLP</h1>
          <p className="text-lg text-gray-500 mt-1">Catat hasil packing boks batangan dari Maker</p>
        </div>
        <Link href="/tablet">
          <Button variant="outline" size="lg">← Kembali</Button>
        </Link>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${actionMsg.startsWith("✅") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"} flex justify-between`}>
          {actionMsg} <button onClick={() => setActionMsg("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Form Catat Packing */}
      <Card className="mb-6">
        <CardTitle className="text-xl">Catat Hasil Packing</CardTitle>
        <div className="mt-4 space-y-4">
          {/* Pilih batch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Boks Batangan (Batch)</label>
            {selectedBatch ? (
              <div className="flex items-center justify-between rounded-lg border-2 border-green-400 bg-green-50 px-4 py-3">
                <div>
                  <p className="font-bold font-mono text-lg">{selectedBatch.code}</p>
                  <p className="text-sm text-gray-600">
                    {selectedBatch.batanganKg.toFixed(2)} kg · dari {selectedBatch.machineCode}
                    {(selectedBatch.packCount ?? 0) > 0 &&
                      ` · sudah packing ${selectedBatch.packCount}× (${selectedBatch.packedBatang ?? 0} batang)`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowBatchPicker(true)}>Ganti</Button>
              </div>
            ) : (
              <Button size="lg" variant="outline" className="w-full border-dashed" onClick={() => setShowBatchPicker(true)}>
                + Pilih Boks Batangan (scan kode btc_...)
              </Button>
            )}
          </div>

          {/* Pilih mesin HLP */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mesin HLP</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
              value={hlpMachineId}
              onChange={(e) => setHlpMachineId(e.target.value)}
            >
              <option value="">Pilih Mesin HLP</option>
              {hlpMachines.map((m: any) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            {hlpMachines.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Belum ada mesin HLP. Setup di Admin → Master Data.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Pack Lolos"
              type="number"
              inputMode="numeric"
              value={packsLolos}
              onChange={(e) => setPacksLolos(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Isi per Pack"
              type="number"
              inputMode="numeric"
              value={isiPerPack}
              onChange={(e) => setIsiPerPack(e.target.value)}
            />
            <Input
              label="Reject (batang)"
              type="number"
              inputMode="numeric"
              value={rejectBatangan}
              onChange={(e) => setRejectBatangan(e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Preview */}
          {selectedBatch && (
            <div className="rounded-lg bg-gray-50 p-4 space-y-1 text-sm">
              <div className="flex justify-between border-b border-gray-100 py-1">
                <span className="text-gray-500">Berat batch</span>
                <span className="font-bold">{selectedBatch.batanganKg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-1">
                <span className="text-gray-500">Total batang</span>
                <span className="font-bold">{totalBatang}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Berat per batang</span>
                <span className="font-bold text-primary-700">{beratPerBatangPreview != null ? `${Number(beratPerBatangPreview).toFixed(2)} g` : "-"}</span>
              </div>
            </div>
          )}

          {(selectedBatch?.packCount ?? 0) > 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
              ⚠️ Batch ini <strong>sudah dicatat packingnya</strong> ({selectedBatch!.packCount}×).
              Simpan hanya untuk batch yang belum diproses.
            </div>
          )}
          <Button
            size="operator"
            className="w-full"
            disabled={saving || (selectedBatch?.packCount ?? 0) > 0}
            onClick={handleSubmit}
          >
            {saving ? "Menyimpan..." : "SIMPAN HASIL PACKING"}
          </Button>
        </div>
      </Card>

      {/* Hasil terakhir */}
      {lastResult && (
        <Card highlight="green" className="mb-6">
          <CardTitle>Hasil Tersimpan ✅</CardTitle>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Total Batang", value: lastResult.totalBatang },
              { label: "Berat per Batang", value: `${Number(lastResult.beratPerBatangGram).toFixed(2)} g` },
              { label: "Pack Lolos", value: lastResult.packsLolos },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bahan di mesin ini (gudang input, operator lihat) */}
      <Card className="mb-6">
        <CardTitle>📦 Bahan di Mesin Ini</CardTitle>
        {!hlpMachineId ? (
          <p className="mt-3 text-sm text-gray-400">Pilih mesin HLP dulu untuk melihat bahan yang dikeluarkan gudang.</p>
        ) : machineMaterials.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Belum ada material yang dikeluarkan gudang ke mesin ini.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {machineMaterials.map((m: any) => (
              <div key={m.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{m.outCode}</span>
                  <span className="text-xs text-gray-400">{new Date(m.outAt).toLocaleDateString("id-ID")}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{m.reason}</p>
                <ul className="mt-2 text-sm">
                  {m.items.map((i: any, idx: number) => (
                    <li key={idx} className="flex justify-between border-t border-gray-100 py-1">
                      <span>{i.name}</span>
                      <span className="font-medium">{i.quantity} {i.unit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Riwayat packing */}
      <h3 className="text-lg font-bold text-gray-900 mb-1">Riwayat Packing</h3>
      {!loading && history.length >= 50 && (
        <p className="text-xs text-gray-400 mb-2">Menampilkan 50 entri terbaru.</p>
      )}
      {loading ? (
        <p className="text-center text-gray-400 py-6">Memuat riwayat...</p>
      ) : history.length === 0 ? (
        <Card><p className="text-center text-gray-400 py-6">Belum ada packing. Catat hasil packing pertama.</p></Card>
      ) : (
        <div className="space-y-2">
          {history.map((h: any) => (
            <Card key={h.id}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold font-mono">{h.batchCode}</span>
                  <span className="text-gray-500 ml-2 text-sm">{h.hlpMachineCode ?? "-"}</span>
                  <span className="text-gray-400 ml-2 text-sm">
                    {new Date(h.packedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600">{h.packsLolos} pack · {h.rejectBatangan} reject</span>
                  <Badge variant="info">{h.beratPerBatangGram != null ? `${Number(h.beratPerBatangGram).toFixed(2)} g/btg` : "-"}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Batch Picker Dialog */}
      <Dialog open={showBatchPicker} onClose={() => setShowBatchPicker(false)} title="Pilih Boks Batangan">
        <Input
          label="Cari kode batch"
          value={batchSearch}
          onChange={(e) => setBatchSearch(e.target.value)}
          placeholder="cth: btc_MKR01"
          autoFocus
        />
        <div className="space-y-2 max-h-[400px] overflow-y-auto mt-4">
          {filteredBatches.length === 0 ? (
            <p className="text-center text-gray-400 py-6">
              {batches.length === 0 ? "Belum ada batch batangan. Selesaikan sesi boks di Maker dulu." : "Kode tidak ditemukan."}
            </p>
          ) : (
            filteredBatches.map((b) => {
              const packed = (b.packCount ?? 0) > 0;
              return (
                <button
                  key={b.id}
                  disabled={packed}
                  onClick={() => { setSelectedBatch(b); setShowBatchPicker(false); }}
                  className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${
                    packed
                      ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      : "border-gray-200 hover:border-primary-400"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold font-mono text-lg">{b.code}</p>
                      <p className="text-sm text-gray-500">
                        {b.batanganKg.toFixed(2)} kg · dari {b.machineCode}
                      </p>
                    </div>
                    {packed ? (
                      <Badge variant="success">✓ Packing {b.packCount}×</Badge>
                    ) : (
                      <Badge variant="neutral">Belum packing</Badge>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Dialog>
    </div>
  );
}
