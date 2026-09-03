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
  // Keputusan bisnis 3 Sep 2026 (docs/26 §1): karton hanya SLOP | BAL
  const [newCartonUnit, setNewCartonUnit] = useState<"SLOP" | "BAL">("SLOP");

  // Form confirm finished goods — per unit (0029: PACK/SLOP/BAL)
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmShiftId, setConfirmShiftId] = useState("");
  const [fgRows, setFgRows] = useState<any[]>([]);
  const [fgActuals, setFgActuals] = useState<Record<string, string>>({});
  const [fgSaving, setFgSaving] = useState(false);

  // Form isi karton (add-pack): sumber HLP pack atau hasil stage WR/SLOP/BAL
  const [showAddPack, setShowAddPack] = useState<any>(null);
  const [hlpPacks, setHlpPacks] = useState<any[]>([]);
  const [addPackHlpId, setAddPackHlpId] = useState("");
  const [addSourceType, setAddSourceType] = useState<"HLP" | "STAGE">("HLP");
  const [addStage, setAddStage] = useState<"WR" | "SLOP" | "BAL">("WR");
  const [stageAvail, setStageAvail] = useState<any[]>([]);
  const [addStageBatchId, setAddStageBatchId] = useState("");
  const [addPackQty, setAddPackQty] = useState("");
  const [addPackSaving, setAddPackSaving] = useState(false);
  // Makloon: keluar pack ke customer (docs/24 §3.3)
  const [extBatches, setExtBatches] = useState<any[]>([]);
  const [extPackOuts, setExtPackOuts] = useState<any[]>([]);
  const [showExtOut, setShowExtOut] = useState(false);
  const [extOutBatchId, setExtOutBatchId] = useState("");
  const [extOutDest, setExtOutDest] = useState("");
  const [extOutDocRef, setExtOutDocRef] = useState("");
  const [extOutExitStage, setExtOutExitStage] = useState<"PACK" | "PACK_WRAPPED" | "SLOP" | "BAL">("PACK");
  const [extOutPack, setExtOutPack] = useState("");
  const [extOutRejectPack, setExtOutRejectPack] = useState("0");
  const [extOutRejectBatang, setExtOutRejectBatang] = useState("0");
  const [extOutSaving, setExtOutSaving] = useState(false);
  const [extOutError, setExtOutError] = useState("");

  const loadExtMakloon = useCallback(async () => {
    try {
      // Batch EXTERNAL yang sudah di-packing HLP (siap dikembalikan ke customer)
      const [bRes, oRes] = await Promise.all([
        apiFetch("/batches"),
        apiFetch("/external-pack-outs"),
      ]);
      // Semua batch EXTERNAL — entry non-batangan (pack terwrap/slop/bal)
      // tidak punya packCount; batch batangan yang belum dipacking akan
      // ditolak server dengan NOT_PACKED_YET saat submit.
      setExtBatches(
        ((bRes.data ?? []) as any[]).filter((b: any) => b.source === "EXTERNAL")
      );
      setExtPackOuts(oRes.data ?? []);
    } catch { setExtBatches([]); setExtPackOuts([]); }
  }, []);

  useEffect(() => { loadExtMakloon(); }, [loadExtMakloon]);

  const handleSubmitExtOut = async () => {
    if (!extOutBatchId) { setExtOutError("Pilih batch external dulu."); return; }
    if (!extOutDest.trim()) { setExtOutError("Nama customer tujuan wajib diisi."); return; }
    const pack = parseInt(extOutPack || "0", 10) || 0;
    const rp = parseInt(extOutRejectPack || "0", 10) || 0;
    const rb = parseInt(extOutRejectBatang || "0", 10) || 0;
    if (pack + rp + rb === 0) { setExtOutError("Isi minimal satu jumlah."); return; }
    setExtOutSaving(true);
    setExtOutError("");
    try {
      await apiFetch("/external-pack-outs", {
        method: "POST",
        body: JSON.stringify({
          batchId: extOutBatchId,
          destinationName: extOutDest.trim(),
          docRef: extOutDocRef || undefined,
          packQty: pack,
          rejectPackQty: rp,
          rejectBatangQty: rb,
          exitStage: extOutExitStage,
        }),
      });
      setShowExtOut(false);
      setExtOutBatchId(""); setExtOutDest(""); setExtOutDocRef("");
      setExtOutPack(""); setExtOutRejectPack("0"); setExtOutRejectBatang("0");
      loadExtMakloon();
      setMsg("✅ Keluaran makloon dicatat");
    } catch (e: any) { setExtOutError(e.message); }
    finally { setExtOutSaving(false); }
  };

  const openExtDoc = async (id: string) => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`/api/v1/external-pack-outs/${id}/document`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { alert("Gagal membuka dokumen."); return; }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob));
    } catch { alert("Gagal membuka dokumen."); }
  };

  const openAddPack = async (carton: any) => {
    setShowAddPack(carton);
    setAddPackHlpId("");
    setAddPackQty("");
    setAddStageBatchId("");
    setStageAvail([]);
    const unit: string = carton.unit ?? "PACK";
    if (unit === "PACK") {
      // Default: pack dari HLP; "Hasil WR" juga tersedia untuk karton PACK
      setAddSourceType("HLP");
      setAddStage("WR");
      try {
        const res = await apiFetch("/hlp/packs");
        setHlpPacks(res.data ?? []);
      } catch { setHlpPacks([]); }
    } else {
      // Karton SLOP/BAL hanya bisa diisi dari hasil stage-nya sendiri
      setAddSourceType("STAGE");
      const st = unit === "SLOP" ? "SLOP" : "BAL";
      setAddStage(st);
      try {
        const res = await apiFetch(`/cartons/stage-availability?stage=${st}`);
        setStageAvail(res.data ?? []);
      } catch { setStageAvail([]); }
    }
  };

  const unitLabel = (u: string) => (u === "PACK" ? "pack" : u === "SLOP" ? "slop" : "bal");
  const STAGE_UNIT_UI: Record<string, string> = { WR: "PACK", SLOP: "SLOP", BAL: "BAL" };
  const cartonUnit: string = showAddPack?.unit ?? "PACK";
  const selectedPack = hlpPacks.find((h: any) => h.id === addPackHlpId);
  const sisaBatch = selectedPack ? (selectedPack.packsLolos ?? 0) - (selectedPack.usedPackQty ?? 0) : null;
  const selectedStage = stageAvail.find((s: any) => s.batchId === addStageBatchId);
  const sisaKarton = showAddPack ? (showAddPack.capacityPack ?? 0) - (showAddPack.packCount ?? 0) : null;

  const handleAddPack = async () => {
    if (!showAddPack) return;
    const qty = parseInt(addPackQty, 10);
    if (isNaN(qty) || qty < 1) { setMsg(`Isi jumlah ${unitLabel(cartonUnit)} (minimal 1).`); return; }
    const body =
      addSourceType === "HLP"
        ? { sourceType: "HLP_PACK", hlpPackId: addPackHlpId, packQty: qty }
        : { sourceType: "STAGE", batchId: addStageBatchId, stage: addStage, packQty: qty };
    if (addSourceType === "HLP" && !addPackHlpId) { setMsg("Pilih pack dulu."); return; }
    if (addSourceType === "STAGE" && !addStageBatchId) { setMsg("Pilih batch dulu."); return; }
    setAddPackSaving(true);
    try {
      await apiFetch(`/cartons/${showAddPack.id}/add-pack`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg(`✅ ${qty} ${unitLabel(cartonUnit)} ditambahkan ke ${showAddPack.code ?? "karton"}.`);
      setShowAddPack(null);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setAddPackSaving(false); }
  };

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
        body: JSON.stringify({
          productId: newCartonProduct,
          capacityPack: parseInt(newCartonCapacity) || 50,
          unit: newCartonUnit,
        }),
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

  const openConfirmFG = async (shiftId: string) => {
    setConfirmShiftId(shiftId);
    setFgActuals({});
    setShowConfirm(true);
    try {
      const res = await apiFetch(`/finished-goods/${shiftId}`);
      setFgRows(res.data ?? []);
    } catch { setFgRows([]); }
  };

  const handleConfirmFG = async () => {
    // Satu input per unit — submit berurutan (0029: ekspektasi per unit)
    const pending = fgRows.filter((r: any) => r.status === "PENDING");
    if (pending.length === 0) { setMsg("Semua unit sudah terkonfirmasi."); return; }
    for (const r of pending) {
      const val = fgActuals[r.unit] ?? "";
      if (val.trim() === "") { setMsg(`Isi jumlah ${unitLabel(r.unit)} aktual.`); return; }
    }
    setFgSaving(true);
    try {
      for (const r of pending) {
        await apiFetch(`/finished-goods/${confirmShiftId}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            unit: r.unit,
            packsActualCount: parseInt(fgActuals[r.unit] ?? "0", 10),
          }),
        });
      }
      setShowConfirm(false);
      setMsg("✅ Finished goods dikonfirmasi.");
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setFgSaving(false); }
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
        <Button onClick={() => { setNewCartonProduct(products[0]?.id ?? ""); setNewCartonCapacity("50"); setNewCartonUnit("SLOP"); setShowNewCarton(true); }}>
          📦 Buat Karton Baru
        </Button>
        <Button variant="outline" onClick={() => { setExtOutBatchId(""); setExtOutDest(""); setExtOutDocRef(""); setExtOutExitStage("PACK"); setExtOutPack(""); setExtOutRejectPack("0"); setExtOutRejectBatang("0"); setExtOutError(""); setShowExtOut(true); }}>
          📤 Keluar Pack Makloon
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

      {/* Makloon — keluaran pack ke customer */}
      <Card className="mb-6">
        <CardTitle>📤 Makloon — Keluaran ke Customer ({extPackOuts.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          {extPackOuts.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              Belum ada keluaran makloon. Batch external yang sudah di-packing HLP bisa dikembalikan ke customer lewat tombol &quot;📤 Keluar Pack Makloon&quot;.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Batch</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Customer</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Pack</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Reject</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Dok</th>
                </tr>
              </thead>
              <tbody>
                {extPackOuts.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100">
                    <td className="py-3 font-mono text-sm">{o.batchCode}</td>
                    <td className="py-3 font-medium">{o.destinationName}</td>
                    <td className="py-3 text-sm">{o.packQty} pack</td>
                    <td className="py-3 text-sm text-red-600">{o.rejectPackQty} pack · {o.rejectBatangQty} batang</td>
                    <td className="py-3 text-sm">{o.outAt ? new Date(o.outAt).toLocaleDateString("id-ID") : "-"}</td>
                    <td className="py-3">
                      <Button size="sm" variant="outline" onClick={() => openExtDoc(o.id)}>🖨 Dokumen</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

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
                  <td className="py-3 text-sm">
                    <span className="font-medium">{s.machineCode ?? "-"}</span>
                    <span className="text-gray-400 font-mono ml-2">{s.id.slice(0, 8)}</span>
                  </td>
                  <td className="py-3 text-sm text-right">{s.boxesCount ?? 0}</td>
                  <td className="py-3 text-right">
                    {s.yieldPct != null ? (
                      <Badge variant={s.yieldPct >= 110 && s.yieldPct <= 114 ? "success" : "error"}>{s.yieldPct}%</Badge>
                    ) : "-"}
                  </td>
                  <td className="py-3">
                    {s.fgConfirmed ? (
                      <Badge variant="success">✓ FG Terkonfirmasi</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openConfirmFG(s.id)}>
                        ✅ Konfirmasi FG
                      </Button>
                    )}
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
                <th className="pb-3 text-sm font-semibold text-gray-600">Unit</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Kapasitas</th>
                <th className="pb-3 text-sm font-semibold text-gray-600 text-right">Pack Terisi</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {cartons.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Belum ada karton. Klik &quot;Buat Karton Baru&quot;.</td></tr>
              ) : cartons.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-3 font-mono text-sm">{c.code}</td>
                  <td className="py-3 text-sm">{products.find((p) => p.id === c.productId)?.code ?? "-"}</td>
                  <td className="py-3 text-sm"><Badge variant={c.unit === "PACK" ? "neutral" : "warning"}>{c.unit ?? "PACK"}</Badge></td>
                  <td className="py-3 text-sm text-right">{c.capacityPack}</td>
                  <td className="py-3 text-sm text-right">{c.packCount ?? 0} / {c.capacityPack}</td>
                  <td className="py-3">
                    <Badge variant={c.status === "OPEN" ? "info" : c.status === "READY" ? "success" : "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="py-3 flex gap-2">
                    {c.status === "OPEN" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openAddPack(c)}>➕ Isi Pack</Button>
                        <Button size="sm" variant="primary" onClick={() => handleCloseCarton(c.id)}>Tutup → READY</Button>
                      </>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Karton</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={newCartonUnit} onChange={(e) => {
              const u = e.target.value as "SLOP" | "BAL";
              const prd = products.find((p: any) => p.id === newCartonProduct);
              // Default kapasitas dari standar produk (docs/26 §1)
              setNewCartonUnit(u);
              setNewCartonCapacity(
                String(u === "SLOP" ? (prd?.kartonCapacitySlop ?? 50) : (prd?.kartonCapacityBal ?? 4))
              );
            }}>
              <option value="SLOP">SLOP</option>
              <option value="BAL">BAL</option>
            </select>
          </div>
          <Input
            label={`Kapasitas (${unitLabel(newCartonUnit)})`}
            type="number"
            value={newCartonCapacity}
            onChange={(e) => setNewCartonCapacity(e.target.value)}
          />
          <Button className="w-full" onClick={handleCreateCarton}>Buat Karton</Button>
        </div>
      </Dialog>

      {/* Dialog konfirmasi FG — satu input per unit (0029) */}
      <Dialog open={showConfirm} onClose={() => setShowConfirm(false)} title="Konfirmasi Finished Goods">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Jumlah aktual diterima dari HLP untuk shift ini — satu isian per satuan.</p>
          {fgRows.length === 0 && <p className="text-sm text-gray-400">Memuat ekspektasi per unit...</p>}
          {fgRows.map((r: any) => (
            <div key={r.unit}>
              <Input
                label={r.unit === "PACK" ? "Jumlah Pack Aktual" : `Jumlah ${unitLabel(r.unit)} aktual (ekspektasi ${r.packsExpectedCount})`}
                type="number"
                value={fgActuals[r.unit] ?? ""}
                onChange={(e) => setFgActuals((prev) => ({ ...prev, [r.unit]: e.target.value }))}
                placeholder={`Ekspektasi: ${r.packsExpectedCount} ${unitLabel(r.unit)}`}
                disabled={r.status !== "PENDING"}
              />
              {r.status !== "PENDING" && (
                <p className="text-xs text-gray-400 mt-1">Sudah {r.status} (aktual {r.packsActualCount})</p>
              )}
            </div>
          ))}
          <Button className="w-full" onClick={handleConfirmFG} disabled={fgSaving}>
            {fgSaving ? "Menyimpan..." : "Konfirmasi"}
          </Button>
        </div>
      </Dialog>

      {/* Dialog isi karton (pack HLP atau hasil stage) */}
      <Dialog open={!!showAddPack} onClose={() => setShowAddPack(null)} title={`Isi Pack → Karton ${showAddPack?.code ?? ""}`}>
        <div className="space-y-4">
          {cartonUnit === "PACK" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sumber Isi</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={addSourceType} onChange={(e) => setAddSourceType(e.target.value as any)}>
                <option value="HLP">Pack dari HLP</option>
                <option value="STAGE">Hasil WR (pack terwrap)</option>
              </select>
            </div>
          )}
          {addSourceType === "HLP" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pack dari HLP</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={addPackHlpId} onChange={(e) => setAddPackHlpId(e.target.value)}>
                <option value="">Pilih pack (batch · total pack · sisa)</option>
                {hlpPacks.map((h: any) => (
                  <option key={h.id} value={h.id}>
                    {h.batchCode} · {h.packsLolos} pack · sisa {(h.packsLolos ?? 0) - (h.usedPackQty ?? 0)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch (hasil {addStage})</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={addStageBatchId} onChange={(e) => setAddStageBatchId(e.target.value)}>
                <option value="">Pilih batch (kode · sisa {unitLabel(STAGE_UNIT_UI[addStage] ?? "")})</option>
                {stageAvail.map((s: any) => (
                  <option key={`${s.batchId}-${s.stage}`} value={s.batchId}>
                    {s.batchCode} · sisa {s.available} {unitLabel(s.unit)}
                  </option>
                ))}
              </select>
              {stageAvail.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Tidak ada sisa hasil {addStage} yang bisa dikartonkan.</p>
              )}
            </div>
          )}
          <Input
            label={cartonUnit === "PACK" ? "Jumlah pack ke karton ini" : `Jumlah ${unitLabel(cartonUnit)} ke karton ini`}
            type="number"
            value={addPackQty}
            onChange={(e) => setAddPackQty(e.target.value)}
            placeholder={sisaKarton != null ? `maks ${sisaKarton} ${unitLabel(cartonUnit)}` : "cth: 50"}
          />
          {addSourceType === "HLP" && selectedPack && sisaBatch != null && (
            <p className="text-xs text-gray-500">
              Sisa batch: {sisaBatch} pack · Sisa kapasitas karton: {sisaKarton ?? "-"} pack
            </p>
          )}
          {addSourceType === "STAGE" && selectedStage && (
            <p className="text-xs text-gray-500">
              Sisa hasil {addStage}: {selectedStage.available} {unitLabel(selectedStage.unit)} · Sisa kapasitas karton: {sisaKarton ?? "-"} {unitLabel(cartonUnit)}
            </p>
          )}
          <Button className="w-full" onClick={handleAddPack} disabled={addPackSaving || !addPackQty || (addSourceType === "HLP" ? !addPackHlpId : !addStageBatchId)}>
            {addPackSaving ? "Menyimpan..." : "Tambah ke Karton"}
          </Button>
        </div>
      </Dialog>

      {/* Dialog keluar pack makloon */}
      <Dialog open={showExtOut} onClose={() => setShowExtOut(false)} title="📤 Keluar Pack Makloon">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch External</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
              value={extOutBatchId}
              onChange={(e) => setExtOutBatchId(e.target.value)}
            >
              <option value="">Pilih batch (btx_)</option>
              {extBatches.map((b: any) => (
                <option key={b.id} value={b.id}>{b.code} — {Number(b.batanganKg)} kg</option>
              ))}
            </select>
          </div>
          <Input label="Nama Customer *" value={extOutDest} onChange={(e) => setExtOutDest(e.target.value)} placeholder="cth: PT Makloon Jaya" />
          <Input label="Ref. Order (PO/DO)" value={extOutDocRef} onChange={(e) => setExtOutDocRef(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage Keluar</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
              value={extOutExitStage}
              onChange={(e) => setExtOutExitStage(e.target.value as any)}
            >
              <option value="PACK">PACK</option>
              <option value="PACK_WRAPPED">PACK TERWRAP</option>
              <option value="SLOP">SLOP</option>
              <option value="BAL">BAL</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Pack Keluar" type="number" inputMode="numeric" value={extOutPack} onChange={(e) => setExtOutPack(e.target.value)} placeholder="0" />
            <Input label="Reject Pack" type="number" inputMode="numeric" value={extOutRejectPack} onChange={(e) => setExtOutRejectPack(e.target.value)} placeholder="0" />
            <Input label="Reject Batang" type="number" inputMode="numeric" value={extOutRejectBatang} onChange={(e) => setExtOutRejectBatang(e.target.value)} placeholder="0" />
          </div>
          {extOutError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{extOutError}</div>}
          <Button size="operator" className="w-full" disabled={extOutSaving} onClick={handleSubmitExtOut}>
            {extOutSaving ? "Menyimpan..." : "SIMPAN"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}