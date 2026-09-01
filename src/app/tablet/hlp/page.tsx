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
  source?: string; // INTERNAL | EXTERNAL (makloon, docs/24)
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
          source: b.source ?? "INTERNAL",
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
  // Reject pack + alasan (docs/23 §4.3) — reject pack dihitung sebagai batangan
  const [rejectPacks, setRejectPacks] = useState("0");
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);

  // ===========================================================================
  // Sesi HLP (docs/23) — status + anggota; open-ended, ganti anggota tanpa tutup
  // ===========================================================================
  const [session, setSession] = useState<any>(null); // sesi OPEN mesin terpilih
  const [sessionMembers, setSessionMembers] = useState<any[]>([]);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [pickedMemberId, setPickedMemberId] = useState("");

  const loadSession = useCallback(async (machineId: string) => {
    if (!machineId) { setSession(null); setSessionMembers([]); return; }
    try {
      const res = await apiFetch(`/hlp/shifts?status=OPEN&machineId=${machineId}`);
      const open = res.data?.[0] ?? null;
      setSession(open);
      if (open) {
        const d = await apiFetch(`/hlp/shifts/${open.id}`);
        setSessionMembers(d.members ?? []);
      } else {
        setSessionMembers([]);
      }
    } catch { setSession(null); setSessionMembers([]); }
  }, []);

  useEffect(() => { loadSession(hlpMachineId); }, [hlpMachineId, loadSession]);

  const handleOpenSession = async () => {
    if (!hlpMachineId) { setActionMsg("Pilih mesin HLP dulu."); return; }
    setSessionBusy(true);
    setActionMsg("");
    try {
      const res = await apiFetch("/hlp/shifts", {
        method: "POST",
        body: JSON.stringify({ hlpMachineId }),
      });
      setActionMsg(`✅ Sesi dibuka ${new Date(res.startedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`);
      await loadSession(hlpMachineId);
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setSessionBusy(false); }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    setSessionBusy(true);
    setActionMsg("");
    try {
      await apiFetch(`/hlp/shifts/${session.id}/close`, { method: "POST", body: JSON.stringify({}) });
      setActionMsg("✅ Sesi ditutup");
      await loadSession(hlpMachineId);
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setSessionBusy(false); }
  };

  const openMemberPicker = async () => {
    try {
      const res = await apiFetch("/users");
      setUsers(res.data ?? []);
      setPickedMemberId("");
      setShowMemberPicker(true);
    } catch (e: any) { setActionMsg(e.message); }
  };

  const handleAddMember = async () => {
    if (!session || !pickedMemberId) return;
    setSessionBusy(true);
    try {
      await apiFetch(`/hlp/shifts/${session.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: pickedMemberId }),
      });
      await loadSession(hlpMachineId);
      setShowMemberPicker(false);
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setSessionBusy(false); }
  };

  const handleLeaveMember = async (memberId: string) => {
    if (!session) return;
    setSessionBusy(true);
    try {
      await apiFetch(`/hlp/shifts/${session.id}/members/${memberId}`, { method: "PATCH", body: JSON.stringify({}) });
      await loadSession(hlpMachineId);
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setSessionBusy(false); }
  };

  // ===========================================================================
  // Sisa batch (docs/23 §2.4) — konteks pekerjaan saat ganti kru
  // ===========================================================================
  const [batchSummary, setBatchSummary] = useState<any>(null);
  useEffect(() => {
    if (!selectedBatch) { setBatchSummary(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/batches/${selectedBatch.id}/summary`);
        if (!cancelled) setBatchSummary(res);
      } catch { if (!cancelled) setBatchSummary(null); }
    })();
    return () => { cancelled = true; };
  }, [selectedBatch]);

  // Input operasional (material/downtime/maintenance/waste) — docs/23 §3
  const [showMatOut, setShowMatOut] = useState(false);
  const [matOutFlow, setMatOutFlow] = useState<"PEMAKAIAN" | "WASTE">("PEMAKAIAN");
  const [matOutType, setMatOutType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [matItems, setMatItems] = useState<any[]>([]);
  const [matItemId, setMatItemId] = useState("");
  const [matQty, setMatQty] = useState("");
  const [matReason, setMatReason] = useState("");
  const [matBusy, setMatBusy] = useState(false);
  const [showDowntime, setShowDowntime] = useState(false);
  const [dtStartedAt, setDtStartedAt] = useState("");
  const [dtEndedAt, setDtEndedAt] = useState("");
  const [dtReason, setDtReason] = useState("");
  const [dtBusy, setDtBusy] = useState(false);
  const [showMaint, setShowMaint] = useState(false);
  const [maintType, setMaintType] = useState<"PERBAIKAN" | "PREVENTIVE">("PERBAIKAN");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintBusy, setMaintBusy] = useState(false);

  const loadMatItems = async (type: "CONSUMABLE" | "SPAREPART") => {
    try {
      const path = type === "CONSUMABLE" ? "/consumable-items" : "/spareparts";
      const res = await apiFetch(path);
      // applicable_machines: hanya item relevan mesin HLP
      setMatItems((res.data ?? []).filter((i: any) => {
        const am = i.applicableMachines ?? "BOTH";
        return am === "BOTH" || am === "HLP";
      }));
    } catch { setMatItems([]); }
  };

  const filteredBatches = batches
    .filter((b) => b.code.toLowerCase().includes(batchSearch.toLowerCase()))
    .sort((a, b) => (a.packCount ?? 0) - (b.packCount ?? 0)); // belum packing di atas

  // Preview perhitungan — reject pack dihitung sebagai batangan (docs/23 §4.1)
  const totalBatang = ((parseInt(packsLolos || "0", 10) || 0) + (parseInt(rejectPacks || "0", 10) || 0)) * (parseInt(isiPerPack || "0", 10) || 0) + (parseInt(rejectBatangan || "0", 10) || 0);
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
    const rejectP = parseInt(rejectPacks || "0", 10) || 0;

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
          rejectPacks: rejectP,
          ...(rejectP > 0 || reject > 0 ? { rejectReason: rejectReason || undefined } : {}),
        }),
      });
      setLastResult(result);
      setActionMsg(`✅ Packing dicatat — berat per batang ${Number(result.beratPerBatangGram).toFixed(2)} g/batang`);
      setPacksLolos("");
      setRejectBatangan("0");
      setRejectPacks("0");
      setRejectReason("");
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

  // ===========================================================================
  // Submit input operasional
  // ===========================================================================

  const handleSubmitMatOut = async () => {
    if (!hlpMachineId) { setActionMsg("Pilih mesin HLP dulu."); return; }
    const qty = parseFloat(matQty);
    if (!matItemId || isNaN(qty) || qty <= 0) { setActionMsg("Pilih item dan isi jumlah."); return; }
    if (!matReason.trim() || matReason.trim().length < 3) { setActionMsg("Alasan wajib (min 3 karakter)."); return; }
    setMatBusy(true);
    try {
      await apiFetch("/material-out", {
        method: "POST",
        body: JSON.stringify({
          materialType: matOutType,
          outType: matOutFlow,
          machineId: hlpMachineId,
          counterpartName: "",
          reason: matReason.trim(),
          items: [{ itemId: matItemId, quantity: qty }],
        }),
      });
      setActionMsg(`✅ ${matOutFlow === "PEMAKAIAN" ? "Pemakaian" : "Waste"} material dicatat`);
      setShowMatOut(false);
      setMatItemId(""); setMatQty(""); setMatReason("");
      loadMachineMaterials(hlpMachineId);
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setMatBusy(false); }
  };

  const handleSubmitDowntime = async () => {
    if (!hlpMachineId) { setActionMsg("Pilih mesin HLP dulu."); return; }
    if (!dtStartedAt || !dtEndedAt) { setActionMsg("Isi jam mulai dan selesai."); return; }
    if (!dtReason.trim() || dtReason.trim().length < 3) { setActionMsg("Alasan wajib (min 3 karakter)."); return; }
    setDtBusy(true);
    try {
      await apiFetch(`/machines/${hlpMachineId}/downtime`, {
        method: "POST",
        body: JSON.stringify({
          startedAt: new Date(dtStartedAt).toISOString(),
          endedAt: new Date(dtEndedAt).toISOString(),
          reason: dtReason.trim(),
        }),
      });
      setActionMsg("✅ Downtime dicatat");
      setShowDowntime(false);
      setDtStartedAt(""); setDtEndedAt(""); setDtReason("");
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setDtBusy(false); }
  };

  const handleSubmitMaint = async () => {
    if (!hlpMachineId) { setActionMsg("Pilih mesin HLP dulu."); return; }
    if (!maintDesc.trim() || maintDesc.trim().length < 3) { setActionMsg("Deskripsi wajib (min 3 karakter)."); return; }
    setMaintBusy(true);
    try {
      await apiFetch(`/machines/${hlpMachineId}/maintenance`, {
        method: "POST",
        body: JSON.stringify({ maintenanceType: maintType, description: maintDesc.trim() }),
      });
      setActionMsg("✅ Maintenance dicatat");
      setShowMaint(false);
      setMaintDesc("");
    } catch (e: any) {
      setActionMsg(e.message);
    } finally { setMaintBusy(false); }
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
                  <p className="font-bold font-mono text-lg">
                    {selectedBatch.code}{" "}
                    {selectedBatch.source === "EXTERNAL" && <Badge variant="warning">EXTERNAL</Badge>}
                  </p>
                  <p className="text-sm text-gray-600">
                    {selectedBatch.batanganKg.toFixed(2)} kg · dari {selectedBatch.machineCode ?? (selectedBatch.source === "EXTERNAL" ? "makloon" : "-")}
                    {(selectedBatch.packCount ?? 0) > 0 &&
                      ` · sudah packing ${selectedBatch.packCount}× (${selectedBatch.packedBatang ?? 0} batang)`}
                  </p>
                  {batchSummary && batchSummary.totalBatangPakai > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Sisa batch ≈ {batchSummary.sisaBatangEst} batang ({batchSummary.sisaKgEst} kg)
                      · terpakai {batchSummary.totalBatangPakai} batang
                    </p>
                  )}
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Reject (pack) — dihitung sebagai batangan"
              type="number"
              inputMode="numeric"
              value={rejectPacks}
              onChange={(e) => setRejectPacks(e.target.value)}
              placeholder="0"
            />
            {(parseInt(rejectPacks || "0", 10) || 0) > 0 || (parseInt(rejectBatangan || "0", 10) || 0) > 0 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alasan Reject</label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                >
                  <option value="">Pilih alasan</option>
                  <option value="SOBEK">Sobek</option>
                  <option value="BERAT_SALAH">Berat salah</option>
                  <option value="KOTOR">Kotor</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
              </div>
            ) : null}
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

      {/* Sesi HLP — open-ended, ganti anggota tanpa tutup (docs/23) */}
      <Card className="mb-6">
        <CardTitle>👥 Sesi HLP</CardTitle>
        {!hlpMachineId ? (
          <p className="mt-3 text-sm text-gray-400">Pilih mesin HLP dulu untuk mengelola sesi.</p>
        ) : session ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-300 px-4 py-3">
              <div>
                <Badge variant="success">SESI AKTIF</Badge>
                <p className="text-xs text-gray-500 mt-1">
                  Mulai {new Date(session.startedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · {session.activeMemberCount ?? sessionMembers.length} anggota
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={sessionBusy} onClick={handleCloseSession}>
                Tutup Sesi
              </Button>
            </div>
            {/* Anggota */}
            <div className="space-y-1">
              {sessionMembers.filter((m) => m.leftAt == null).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <span className="font-medium">{m.userName} {m.roleName ? <span className="text-xs text-gray-400">({m.roleName})</span> : null}</span>
                  <button className="text-xs text-red-600" disabled={sessionBusy} onClick={() => handleLeaveMember(m.id)}>Lepas</button>
                </div>
              ))}
              {sessionMembers.filter((m) => m.leftAt == null).length === 0 && (
                <p className="text-sm text-gray-400 py-2 text-center">Belum ada anggota. Tambah anggota di bawah.</p>
              )}
            </div>
            <Button size="sm" variant="outline" className="w-full border-dashed" disabled={sessionBusy} onClick={openMemberPicker}>
              + Tambah Anggota
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-gray-400">Belum ada sesi terbuka untuk mesin ini. Sesi tidak terbatas 8 jam — anggota bisa diganti tanpa menutup sesi; tutup otomatis kalau idle 6 jam.</p>
            <Button size="sm" className="w-full" disabled={sessionBusy} onClick={handleOpenSession}>
              {sessionBusy ? "Membuka..." : "Buka Sesi"}
            </Button>
          </div>
        )}
      </Card>

      {/* Input Operasional dari tablet (docs/23 §3) */}
      <Card className="mb-6">
        <CardTitle>⚙️ Input Operasional</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button size="sm" variant="outline" disabled={!hlpMachineId} onClick={() => { setMatOutFlow("PEMAKAIAN"); setMatOutType("CONSUMABLE"); loadMatItems("CONSUMABLE"); setMatItemId(""); setMatQty(""); setMatReason(""); setShowMatOut(true); }}>
            🧵 Material (pemakaian)
          </Button>
          <Button size="sm" variant="outline" disabled={!hlpMachineId} onClick={() => { setMatOutFlow("WASTE"); setMatOutType("CONSUMABLE"); loadMatItems("CONSUMABLE"); setMatItemId(""); setMatQty(""); setMatReason(""); setShowMatOut(true); }}>
            🗑️ Waste material
          </Button>
          <Button size="sm" variant="outline" disabled={!hlpMachineId} onClick={() => { setDtStartedAt(""); setDtEndedAt(""); setDtReason(""); setShowDowntime(true); }}>
            ⏸️ Downtime mesin
          </Button>
          <Button size="sm" variant="outline" disabled={!hlpMachineId} onClick={() => { setMaintDesc(""); setMaintType("PERBAIKAN"); setShowMaint(true); }}>
            🔧 Maintenance
          </Button>
        </div>
        {!hlpMachineId && <p className="mt-2 text-xs text-gray-400">Pilih mesin HLP dulu.</p>}
      </Card>

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
                      <p className="font-bold font-mono text-lg">
                        {b.code}{" "}
                        {b.source === "EXTERNAL" && <Badge variant="warning">EXTERNAL</Badge>}
                      </p>
                      <p className="text-sm text-gray-500">
                        {b.batanganKg.toFixed(2)} kg · dari {b.machineCode ?? "makloon"}
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

      {/* Dialog pilih anggota sesi */}
      <Dialog open={showMemberPicker} onClose={() => setShowMemberPicker(false)} title="Tambah Anggota Sesi">
        <select
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
          value={pickedMemberId}
          onChange={(e) => setPickedMemberId(e.target.value)}
        >
          <option value="">Pilih user</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
          ))}
        </select>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setShowMemberPicker(false)}>Batal</Button>
          <Button className="flex-1" disabled={!pickedMemberId || sessionBusy} onClick={handleAddMember}>
            {sessionBusy ? "Menyimpan..." : "Tambah"}
          </Button>
        </div>
      </Dialog>

      {/* Dialog material pemakaian / waste */}
      <Dialog
        open={showMatOut}
        onClose={() => setShowMatOut(false)}
        title={matOutFlow === "PEMAKAIAN" ? "🧵 Pemakaian Material" : "🗑️ Waste Material"}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["CONSUMABLE", "SPAREPART"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setMatOutType(t); loadMatItems(t); setMatItemId(""); }}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium ${
                  matOutType === t ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-500"
                }`}
              >
                {t === "CONSUMABLE" ? "🧵 Consumable" : "🔧 Sparepart"}
              </button>
            ))}
          </div>
          <select
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
            value={matItemId}
            onChange={(e) => setMatItemId(e.target.value)}
          >
            <option value="">Pilih item</option>
            {matItems.map((i: any) => (
              <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
            ))}
          </select>
          <Input label="Jumlah" type="number" inputMode="numeric" value={matQty} onChange={(e) => setMatQty(e.target.value)} placeholder="0" />
          <Input
            label="Alasan *"
            value={matReason}
            onChange={(e) => setMatReason(e.target.value)}
            placeholder={matOutFlow === "PEMAKAIAN" ? "cth: Pemakaian produksi shift ini" : "cth: Bobin sobek saat proses"}
          />
          <Button size="operator" className="w-full" disabled={matBusy} onClick={handleSubmitMatOut}>
            {matBusy ? "Menyimpan..." : "SIMPAN"}
          </Button>
        </div>
      </Dialog>

      {/* Dialog downtime */}
      <Dialog open={showDowntime} onClose={() => setShowDowntime(false)} title="⏸️ Downtime Mesin">
        <div className="space-y-3">
          <Input label="Mulai" type="datetime-local" value={dtStartedAt} onChange={(e) => setDtStartedAt(e.target.value)} />
          <Input label="Selesai" type="datetime-local" value={dtEndedAt} onChange={(e) => setDtEndedAt(e.target.value)} />
          <Input label="Alasan *" value={dtReason} onChange={(e) => setDtReason(e.target.value)} placeholder="cth: Ganti material" />
          <Button size="operator" className="w-full" disabled={dtBusy} onClick={handleSubmitDowntime}>
            {dtBusy ? "Menyimpan..." : "SIMPAN"}
          </Button>
        </div>
      </Dialog>

      {/* Dialog maintenance */}
      <Dialog open={showMaint} onClose={() => setShowMaint(false)} title="🔧 Maintenance Mesin">
        <div className="space-y-3">
          <select
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
            value={maintType}
            onChange={(e) => setMaintType(e.target.value as "PERBAIKAN" | "PREVENTIVE")}
          >
            <option value="PERBAIKAN">Perbaikan</option>
            <option value="PREVENTIVE">Preventive</option>
          </select>
          <Input label="Deskripsi *" value={maintDesc} onChange={(e) => setMaintDesc(e.target.value)} placeholder="cth: Ganti pisau filter" />
          <Button size="operator" className="w-full" disabled={maintBusy} onClick={handleSubmitMaint}>
            {maintBusy ? "Menyimpan..." : "SIMPAN"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
