"use client";
import { apiFetch } from "@/lib/utils/api-client";
import { splitBatanganProportional } from "@/lib/calc";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// =============================================================================
// Mock Data
// =============================================================================
interface BoxData {
  id: string;
  boxNumber: number;
  boxCode: string;
  tsgWeightKg: number;
  isPartial: boolean;
  openedAt: string;
  completedAt?: string;
  outputWeightKg?: number;
  yieldPct?: number;
  indicator?: "NORMAL" | "WARNING";
  tsgType?: string | null;
}

interface SessionData {
  id: string;
  status: string;
  totalBatanganKg?: string | null;
  batchCode?: string | null;
  boxes: BoxData[];
}

interface SessionWeighResult {
  batchCode: string;
  totalBatanganKg: number;
  boxes: Array<{ boxId: string; boxNumber: number; outputWeightKg: number; yieldPct: number; indicator: "NORMAL" | "WARNING" }>;
}

// =============================================================================
// Page Component
// =============================================================================

export default function ShiftActivePage() {
  const router = useRouter();
  const params = useParams();
  const shiftId = params?.id as string;

  // Real data from API (used when real shift ID is provided)
  const [shiftData, setShiftData] = useState<any>(null);
  const [apiInventory, setApiInventory] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!shiftId || shiftId === "test-id") { setDataLoading(false); return; }
    try {
      const [detail, inv, sessionsResp] = await Promise.all([
        apiFetch(`/shifts/${shiftId}`),
        apiFetch("/tsg-inventory/available?limit=50"),
        apiFetch(`/shifts/${shiftId}/box-sessions`),
      ]);
      setShiftData(detail);
      setApiInventory((inv.data ?? []).map((item: any) => ({ ...item, id: item.inventoryId ?? item.id })));
      // Set completed boxes from API
      if (detail?.boxes) {
        const completed = detail.boxes.filter((b: any) => b.completedAt).map((b: any) => ({
          id: b.id, boxNumber: b.boxNumber, boxCode: b.boxCode,
          tsgWeightKg: parseFloat(b.tsgWeightKg), outputWeightKg: parseFloat(b.outputWeightKg || "0"),
          yieldPct: parseFloat(b.yieldPct || "0"), isPartial: b.isPartial, tsgType: b.tsgType ?? null,
          openedAt: new Date(b.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          completedAt: b.completedAt ? new Date(b.completedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : undefined,
          indicator: b.yieldPct ? (parseFloat(b.yieldPct) >= 110 && parseFloat(b.yieldPct) <= 114 ? "NORMAL" as const : "WARNING" as const) : undefined,
        }));
        setCompletedBoxes(completed);
        // Semua boks aktif (bisa >1 dalam satu sesi)
        const active = detail.boxes.filter((b: any) => !b.completedAt).map((b: any) => ({
          id: b.id, boxNumber: b.boxNumber, boxCode: b.boxCode,
          tsgWeightKg: parseFloat(b.tsgWeightKg), isPartial: b.isPartial, tsgType: b.tsgType ?? null,
          openedAt: new Date(b.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        }));
        setActiveBoxes(active);
      }
      // Map sesi → boks + kode batch
      const sessions: any[] = sessionsResp?.data ?? [];
      const openSession = sessions.find((s: any) => s.status === "OPEN");
      if (openSession) {
        setActiveSession({
          id: openSession.id,
          status: openSession.status,
          batchCode: openSession.batchCode ?? null,
          totalBatanganKg: openSession.totalBatanganKg ?? null,
          boxes: (openSession.boxes ?? []).map((b: any) => ({
            id: b.boxId, boxNumber: b.boxNumber, boxCode: b.boxCode,
            tsgWeightKg: parseFloat(b.tsgWeightKg), isPartial: b.isPartial,
            openedAt: new Date(b.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          })),
        });
      } else {
        setActiveSession(null);
      }
      // Map boxId → batchCode untuk tampilan boks selesai
      const map = new Map<string, string>();
      for (const s of sessions) {
        if (s.batchCode && s.boxes) {
          for (const b of s.boxes) map.set(b.boxId, s.batchCode);
        }
      }
      setBatchByBox(map);
    } catch { /* tetap pakai data kosong */ }
    finally { setDataLoading(false); }
  }, [shiftId]);

  useEffect(() => { loadData(); }, [loadData]);

  const inventoryList = apiInventory;

  // State
  const [activeBoxes, setActiveBoxes] = useState<BoxData[]>([]);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [batchByBox, setBatchByBox] = useState<Map<string, string>>(new Map());
  const [completedBoxes, setCompletedBoxes] = useState<BoxData[]>([]);
  const [consumptionEvents, setConsumptionEvents] = useState<any[]>([]);
  const [downtimeEvents, setDowntimeEvents] = useState<any[]>([]);
  const [maintenanceEvents, setMaintenanceEvents] = useState<any[]>([]);
  const [actionMsg, setActionMsg] = useState("");
  const [lastSessionResult, setLastSessionResult] = useState<SessionWeighResult | null>(null);

  // Dialog states
  const [showWeigh, setShowWeigh] = useState(false);
  const [showSessionWeigh, setShowSessionWeigh] = useState(false);
  const [showOpenBox, setShowOpenBox] = useState(false);
  const [openCount, setOpenCount] = useState(1);
  const [openSelected, setOpenSelected] = useState<string[]>([]);
  const [openRealWeights, setOpenRealWeights] = useState<Record<string, string>>({});
  const [showConsumption, setShowConsumption] = useState(false);
  const [showDowntime, setShowDowntime] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);
  const [endShiftLoading, setEndShiftLoading] = useState(false);
  const [wasteForm, setWasteForm] = useState<Record<string, { kg: string; status: string }>>({
    MENIR: { kg: "", status: "PENDING" },
    RIJEKAN: { kg: "", status: "PENDING" },
    DEBU_KASAR: { kg: "", status: "PENDING" },
    DEBU_HALUS: { kg: "", status: "PENDING" },
  });
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffSisa, setHandoffSisa] = useState("");
  const [handoffBatangan, setHandoffBatangan] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [endNotes, setEndNotes] = useState("");
  const [endConsumptions, setEndConsumptions] = useState<Array<{ itemId: string; qty: string; note: string }>>([]);

  // Consumable/Downtime/Maintenance form
  const [consumables, setConsumables] = useState<any[]>([]);
  const [spareparts, setSpareparts] = useState<any[]>([]);
  const [consForm, setConsForm] = useState({ itemId: "", qty: "", note: "" });
  const [downForm, setDownForm] = useState({ cat: "GANTI_MATERIAL", dur: "", desc: "" });
  const [mtnForm, setMtnForm] = useState({ partId: "", qty: "", note: "" });
  const [consSaving, setConsSaving] = useState(false);
  const [mtnSaving, setMtnSaving] = useState(false);

  // Load master data consumables & spareparts saat dialog pertama dibuka
  const loadMasterItems = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        apiFetch("/consumable-items"),
        apiFetch("/spareparts"),
      ]);
      setConsumables(c.data ?? []);
      setSpareparts(s.data ?? []);
    } catch { /* biarkan kosong */ }
  }, []);

  useEffect(() => {
    if (showConsumption || showMaintenance || showEndShift) loadMasterItems();
  }, [showConsumption, showMaintenance, showEndShift, loadMasterItems]);

  // =============================================================
  // Weigh — legacy boks tunggal tanpa sesi (boks parsial handoff)
  // =============================================================
  const [outputWeight, setOutputWeight] = useState("");
  const legacyActiveBox = !activeSession && activeBoxes.length === 1 ? activeBoxes[0] : null;
  const yieldPreview = legacyActiveBox && outputWeight
    ? ((parseFloat(outputWeight) / legacyActiveBox.tsgWeightKg) * 100).toFixed(2)
    : null;
  const yieldIndicator = yieldPreview
    ? parseFloat(yieldPreview) >= 110 && parseFloat(yieldPreview) <= 114
      ? "NORMAL"
      : "WARNING"
    : null;

  const handleWeigh = async () => {
    if (legacyActiveBox && shiftId && shiftId !== "test-id") {
      try {
        const result = await apiFetch(`/boxes/${legacyActiveBox.id}`, {
          method: "PATCH",
          body: JSON.stringify({ outputWeightKg: parseFloat(outputWeight) }),
        });
        setCompletedBoxes(prev => [...prev, { ...legacyActiveBox, outputWeightKg: parseFloat(outputWeight), yieldPct: result.yieldPct, indicator: result.indicator, completedAt: new Date().toISOString() }]);
        loadData();
      } catch (e: any) { alert(e.message); }
    }
    setActiveBoxes([]);
    setShowWeigh(false);
    setOutputWeight("");
  };

  // =============================================================
  // Sesi multi-boks — pilih boks TSG & timbang kolektif
  // =============================================================
  const toggleOpenSelect = (id: string) => {
    setOpenSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= openCount) return prev; // sudah mencapai jumlah
      return [...prev, id];
    });
  };

  const handleOpenSession = async () => {
    if (shiftId && shiftId !== "test-id") {
      try {
        // Berat aktual timbangan pabrik (opsional) — hanya entry yang terisi valid
        const realWeightKg: Record<string, number> = {};
        for (const [inventoryId, v] of Object.entries(openRealWeights)) {
          const num = parseFloat(v);
          if (!isNaN(num) && num > 0) realWeightKg[inventoryId] = num;
        }
        const result = await apiFetch(`/shifts/${shiftId}/box-sessions`, {
          method: "POST",
          body: JSON.stringify({
            inventoryBoxIds: openSelected,
            realWeightKg: Object.keys(realWeightKg).length > 0 ? realWeightKg : undefined,
          }),
        });
        setActiveBoxes(
          result.boxes.map((b: any) => ({
            id: b.boxId,
            boxNumber: b.boxNumber,
            boxCode: b.boxCode,
            tsgWeightKg: parseFloat(b.tsgWeightKg),
            isPartial: b.isPartial,
            openedAt: new Date(b.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          }))
        );
        setLastSessionResult(null);
        loadData();
      } catch (e: any) { alert(e.message); }
    }
    setShowOpenBox(false);
    setOpenCount(1);
    setOpenSelected([]);
    setOpenRealWeights({});
  };

  const [sessionWeight, setSessionWeight] = useState("");
  const sessionSplitPreview = activeSession && sessionWeight && parseFloat(sessionWeight) > 0
    ? splitBatanganProportional(parseFloat(sessionWeight), activeSession.boxes.map((b) => b.tsgWeightKg))
    : null;
  const sessionPreviewWarning = sessionSplitPreview && activeSession
    ? activeSession.boxes.some((box, i) => {
        const out = sessionSplitPreview[i]!;
        const y = box.tsgWeightKg > 0 ? (out / box.tsgWeightKg) * 100 : 0;
        return y < 110 || y > 114;
      })
    : false;

  const handleSessionWeigh = async () => {
    if (!activeSession || !shiftId || shiftId === "test-id") return;
    try {
      const result = await apiFetch(`/box-sessions/${activeSession.id}/weigh`, {
        method: "POST",
        body: JSON.stringify({ totalBatanganKg: parseFloat(sessionWeight) }),
      });
      setLastSessionResult(result);
      setActiveSession(null);
      setActiveBoxes([]);
      setSessionWeight("");
      setShowSessionWeigh(false);
      loadData();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          {dataLoading ? (
            <h1 className="text-3xl font-bold text-gray-900">Memuat shift...</h1>
          ) : shiftData ? (
            <>
              <h1 className="text-3xl font-bold text-gray-900">
                {shiftData.shiftTemplateName ?? "Shift"} · {shiftData.machineCode ?? "MKR-01"}
              </h1>
              <p className="text-lg text-gray-500 mt-1">
                {shiftData.productName ?? "Hummer STD"} · Mulai {shiftData.actualStart ? new Date(shiftData.actualStart).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                {shiftData.actualStart && (
                  <> · Sudah berjalan {Math.floor((Date.now() - new Date(shiftData.actualStart).getTime()) / 3600000)}j {Math.floor(((Date.now() - new Date(shiftData.actualStart).getTime()) % 3600000) / 60000)}m</>
                )}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Tim: {shiftData.members?.map((m: any) => m.userName ?? m.roleName ?? m.userId?.slice(0,6)).join(", ") ?? "-"}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-900">SHIFT · MKR-01</h1>
              <p className="text-lg text-gray-500 mt-1">Hummer STD · Mulai -</p>
            </>
          )}
        </div>
        <Badge variant={shiftData?.status === "RUNNING" ? "success" : shiftData?.status === "COMPLETED" ? "warning" : "success"}>{shiftData?.status ?? "RUNNING"}</Badge>
      </div>

      {/* Hasil sesi terakhir — kode boks batangan untuk HLP */}
      {lastSessionResult && activeBoxes.length === 0 && (
        <Card highlight="green" className="mb-6">
          <CardTitle className="text-2xl">Sesi Selesai ✅</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Total batangan {lastSessionResult.totalBatanganKg} kg — {lastSessionResult.boxes.length} boks
          </p>
          <div className="mt-4 rounded-lg border-2 border-dashed border-green-400 bg-green-50 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Kode Boks Batangan (untuk mesin HLP)</p>
            <p className="text-3xl font-bold font-mono text-green-800 mt-1">{lastSessionResult.batchCode}</p>
            <p className="text-xs text-green-600 mt-2">Tulis kode ini di boks batangan sebelum masuk mesin HLP.</p>
          </div>
          <div className="mt-3 space-y-1">
            {lastSessionResult.boxes.map((b) => (
              <div key={b.boxId} className="flex justify-between text-sm border-b border-gray-100 py-1">
                <span className="font-semibold">Boks #{b.boxNumber}</span>
                <span>{b.outputWeightKg} kg · {b.yieldPct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Active Box Card */}
      {activeSession ? (
        // ================= Sesi Multi-Boks =================
        <Card highlight="green" className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="text-2xl">
                SESI BOKS AKTIF · {activeSession.boxes.length} BOKS
              </CardTitle>
              <CardSubtitle>
                Boks #{activeSession.boxes.map((b) => b.boxNumber).join(", #")}
              </CardSubtitle>
            </div>
            <p className="text-sm text-gray-500">
              Dibuka: {activeSession.boxes[0]?.openedAt}
            </p>
          </div>

          {/* Daftar boks sesi */}
          <div className="space-y-2 mb-4">
            {activeSession.boxes.map((box) => (
              <div key={box.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50/50 px-4 py-2">
                <div>
                  <span className="font-bold">Boks #{box.boxNumber}</span>
                  <span className="text-gray-500 ml-2">{box.boxCode}</span>
                </div>
                <span className="text-sm text-gray-600">TSG {box.tsgWeightKg} kg</span>
              </div>
            ))}
          </div>

          {/* Tombol Besar: SESI SELESAI */}
          <Button
            size="operator"
            variant="primary"
            className="w-full text-3xl"
            onClick={() => { setSessionWeight(""); setShowSessionWeigh(true); }}
          >
            SESI SELESAI · TIMBANG BATANGAN TOTAL
          </Button>

          {/* Handoff button — kalau sisa TSG mau dilanjut shift berikutnya */}
          <Button
            size="lg"
            variant="outline"
            className="w-full mt-3 border-yellow-400 text-yellow-700"
            onClick={() => { setHandoffSisa(""); setHandoffBatangan(""); setHandoffNote(""); setShowHandoff(true); }}
          >
            🤝 Handoff Sisa TSG ke Shift Berikutnya
          </Button>

          {/* Secondary Buttons */}
          <div className="mt-3 flex gap-3">
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowConsumption(true)}
            >
              + Tambah Pemakaian
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowDowntime(true)}
            >
              + Log Downtime
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowMaintenance(true)}
            >
              + Log Maintenance
            </Button>
          </div>
        </Card>
      ) : legacyActiveBox ? (
        // ================= Legacy: boks tunggal tanpa sesi (parsial handoff) =================
        <Card highlight="green" className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="text-2xl">
                BOKS AKTIF #{legacyActiveBox.boxNumber}
              </CardTitle>
              <CardSubtitle>
                {legacyActiveBox.boxCode} · TSG {legacyActiveBox.tsgWeightKg} kg
                {legacyActiveBox.isPartial && (
                  <Badge variant="warning" className="ml-2">PARTIAL</Badge>
                )}
              </CardSubtitle>
            </div>
            <p className="text-sm text-gray-500">
              Dibuka: {legacyActiveBox.openedAt}
            </p>
          </div>

          {/* Tombol Besar: BOKS SELESAI */}
          <Button
            size="operator"
            variant="primary"
            className="w-full text-3xl"
            onClick={() => { setOutputWeight(String(legacyActiveBox.tsgWeightKg)); setShowWeigh(true); }}
          >
            BOKS SELESAI · TIMBANG HASIL BATANGAN
          </Button>

          {/* Handoff button — kalau sisa TSG mau dilanjut shift berikutnya */}
          <Button
            size="lg"
            variant="outline"
            className="w-full mt-3 border-yellow-400 text-yellow-700"
            onClick={() => { setHandoffSisa(""); setHandoffBatangan(""); setHandoffNote(""); setShowHandoff(true); }}
          >
            🤝 Handoff Sisa TSG ke Shift Berikutnya
          </Button>

          {/* Secondary Buttons */}
          <div className="mt-3 flex gap-3">
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowConsumption(true)}
            >
              + Tambah Pemakaian
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowDowntime(true)}
            >
              + Log Downtime
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setShowMaintenance(true)}
            >
              + Log Maintenance
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <p className="text-center text-gray-400 text-lg py-4">
            Tidak ada boks aktif — buka boks baru
          </p>
          <Button
            size="operator"
            variant="primary"
            className="w-full"
            onClick={() => { setOpenCount(1); setOpenSelected([]); setShowOpenBox(true); }}
          >
            BUKA BOKS BARU
          </Button>
        </Card>
      )}

      {/* Action feedback */}
      {actionMsg && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex justify-between">
          {actionMsg} <button onClick={() => setActionMsg("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card><p className="text-xs text-gray-500">Boks Selesai</p><p className="text-2xl font-bold">{completedBoxes.length}</p></Card>
        <Card><p className="text-xs text-gray-500">Yield Rata-rata</p><p className="text-2xl font-bold text-green-700">{completedBoxes.length > 0 ? (completedBoxes.reduce((s, b) => s + (b.yieldPct ?? 0), 0) / completedBoxes.length).toFixed(1) : "-"}%</p></Card>
        <Card><p className="text-xs text-gray-500">Downtime</p><p className="text-2xl font-bold text-yellow-700">{downtimeEvents.reduce((s, d) => s + parseInt(d.dur || "0"), 0)} mnt</p></Card>
        <Card><p className="text-xs text-gray-500">Consumables</p><p className="text-2xl font-bold">{consumptionEvents.length} event</p></Card>
      </div>

      {/* Event Logs */}
      {consumptionEvents.length === 0 && downtimeEvents.length === 0 && maintenanceEvents.length === 0 ? null : (
        <div className="mb-6 space-y-3">
          {consumptionEvents.length > 0 && (
            <Card>
              <CardTitle>Pemakaian Consumables ({consumptionEvents.length})</CardTitle>
              <div className="mt-2 space-y-1">
                {consumptionEvents.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-gray-100 py-1">
                    <span>{e.item} — {e.qty}</span>
                    <span className="text-gray-400">{e.time}{e.note ? ` · ${e.note}` : ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {downtimeEvents.length > 0 && (
            <Card>
              <CardTitle>Downtime ({downtimeEvents.length})</CardTitle>
              <div className="mt-2 space-y-1">
                {downtimeEvents.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-gray-100 py-1">
                    <span>{e.cat} — {e.dur} menit</span>
                    <span className="text-gray-400">{e.time}{e.desc ? ` · ${e.desc}` : ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {maintenanceEvents.length > 0 && (
            <Card>
              <CardTitle>Maintenance ({maintenanceEvents.length})</CardTitle>
              <div className="mt-2 space-y-1">
                {maintenanceEvents.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-gray-100 py-1">
                    <span>{e.part} — {e.qty} unit</span>
                    <span className="text-gray-400">{e.time}{e.note ? ` · ${e.note}` : ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Completed Boxes */}
      {completedBoxes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Boks Selesai</h3>
          <div className="space-y-2">
            {completedBoxes.map((box) => (
              <Card key={box.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold">#{box.boxNumber}</span>
                    <span className="text-gray-500 ml-2">{box.boxCode}</span>
                    {box.tsgType && (
                      <Badge variant="warning" className="ml-2">{box.tsgType}</Badge>
                    )}
                    <span className="text-gray-400 ml-2 text-sm">
                      {box.openedAt} → {box.completedAt}
                    </span>
                    {batchByBox.get(box.id) && (
                      <Badge variant="info" className="ml-2 font-mono">{batchByBox.get(box.id)}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      {box.outputWeightKg} kg / {box.tsgWeightKg} kg
                    </span>
                    <Badge variant={box.indicator === "NORMAL" ? "success" : "error"}>
                      {box.yieldPct}%
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="flex gap-4">
        <Button
          size="xl"
          variant="primary"
          className="flex-1"
          onClick={() => { setOpenCount(1); setOpenSelected([]); setShowOpenBox(true); }}
          disabled={activeBoxes.length > 0}
        >
          BUKA BOKS BARU
        </Button>
        <Button
          size="xl"
          variant="danger"
          className="flex-1"
          onClick={() => setShowEndShift(true)}
          disabled={activeBoxes.length > 0}
        >
          AKHIRI SHIFT
        </Button>
      </div>

      {/* ================================================================= */}
      {/* DIALOGS */}
      {/* ================================================================= */}

      {/* Weigh Box Dialog (legacy boks tunggal) */}
      <Dialog open={showWeigh} onClose={() => setShowWeigh(false)} title="Timbang Hasil Boks">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">TSG Input: {legacyActiveBox?.tsgWeightKg} kg</p>
          </div>
          <Input
            label="Berat Batangan (kg)"
            type="number"
            inputMode="decimal"
            value={outputWeight}
            onChange={(e) => setOutputWeight(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
          {yieldPreview && (
            <div className={`rounded-lg p-4 text-center text-2xl font-bold ${
              yieldIndicator === "NORMAL"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}>
              Yield: {yieldPreview}% — {yieldIndicator === "NORMAL" ? "NORMAL" : "WARNING"}
            </div>
          )}
          <Button
            size="operator"
            className="w-full"
            disabled={!outputWeight || parseFloat(outputWeight) <= 0.01}
            onClick={handleWeigh}
          >
            Timbang & Selesai
          </Button>
        </div>
      </Dialog>

      {/* Weigh Session Dialog — timbang kolektif */}
      <Dialog open={showSessionWeigh} onClose={() => setShowSessionWeigh(false)} title="Timbang Batangan Akhir Sesi">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Timbang batangan dari {activeSession?.boxes.length} boks sekaligus.
            Berat total dibagi otomatis secara proporsional per boks.
          </p>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">
              TSG yang dipakai sesi ini:{" "}
              <span className="font-bold text-gray-900">
                {activeSession?.boxes.reduce((s, b) => s + b.tsgWeightKg, 0).toFixed(2)} kg
              </span>{" "}
              dari {activeSession?.boxes.length} boks
            </p>
          </div>
          <Input
            label="Total Berat Batangan (kg)"
            type="number"
            inputMode="decimal"
            value={sessionWeight}
            onChange={(e) => setSessionWeight(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
          {sessionSplitPreview && activeSession && (
            <>
              <div className="rounded-lg bg-gray-50 p-4 space-y-1">
                <p className="text-xs font-semibold text-gray-500 mb-2">PEMBAGIAN OTOMATIS (PREVIEW)</p>
                {activeSession.boxes.map((box, i) => {
                  const out = sessionSplitPreview[i]!;
                  const y = box.tsgWeightKg > 0 ? (out / box.tsgWeightKg) * 100 : 0;
                  const normal = y >= 110 && y <= 114;
                  return (
                    <div key={box.id} className="flex justify-between text-sm border-b border-gray-100 py-1">
                      <span className="font-semibold">Boks #{box.boxNumber}</span>
                      <span className="text-gray-600">
                        TSG {box.tsgWeightKg} kg → {out.toFixed(2)} kg ·{" "}
                        <span className={`font-bold ${normal ? "text-green-700" : "text-red-700"}`}>
                          {y.toFixed(2)}%
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {sessionPreviewWarning ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-700">
                  ⚠️ Yield di luar rentang normal (110–114%). Periksa timbangan batangan sebelum menyimpan.
                </div>
              ) : (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm font-semibold text-green-700">
                  ✅ Yield semua boks dalam rentang normal (110–114%).
                </div>
              )}
            </>
          )}
          <Button
            size="operator"
            className="w-full"
            disabled={!sessionWeight || parseFloat(sessionWeight) <= 0.01}
            onClick={handleSessionWeigh}
          >
            Timbang & Selesaikan Sesi
          </Button>
        </div>
      </Dialog>

      {/* Open Box Dialog — pilih jumlah, lalu pilih boks TSG dari inventory */}
      <Dialog open={showOpenBox} onClose={() => setShowOpenBox(false)} title="Buka Boks Baru">
        <p className="text-sm text-gray-500 mb-3">
          Langkah 1 — pilih berapa boks yang dibuka sekaligus:
        </p>
        <div className="grid grid-cols-6 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => { setOpenCount(n); setOpenSelected([]); setOpenRealWeights({}); }}
              className={`rounded-lg border-2 py-3 text-2xl font-bold transition-colors ${
                openCount === n
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-2">
          Langkah 2 — pilih boks TSG dari gudang ({openSelected.length}/{openCount} terpilih):
        </p>
        <div className="space-y-2 max-h-[300px] overflow-y-auto mb-4">
          {inventoryList.map((item, i) => {
            const selected = openSelected.includes(item.id);
            const reachedLimit = openSelected.length >= openCount && !selected;
            return (
              <button
                key={item.id}
                onClick={() => toggleOpenSelect(item.id)}
                disabled={reachedLimit}
                className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${
                  selected
                    ? "border-primary-500 bg-primary-50"
                    : reachedLimit
                      ? "border-gray-100 opacity-40"
                      : "border-gray-200 hover:border-primary-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded border-2 text-sm font-bold ${
                      selected ? "border-primary-500 bg-primary-500 text-white" : "border-gray-300 text-transparent"
                    }`}>✓</span>
                    <div>
                      <p className="font-bold text-lg">{item.boxCode}</p>
                      <p className="text-sm text-gray-500">
                        {item.weightKg} kg · Umur {item.ageInDays} hari · {item.location}
                      </p>
                    </div>
                  </div>
                  {i === 0 && (
                    <Badge variant="warning">Disarankan (FIFO)</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {openSelected.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              BERAT AKTUAL TIMBANGAN PABRIK (OPSIONAL) — kosongkan untuk pakai berat supplier
            </p>
            <div className="space-y-2">
              {openSelected.map((id) => {
                const item = inventoryList.find((i) => i.id === id);
                if (!item) return null;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-40 text-sm font-semibold flex-shrink-0">{item.boxCode}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={String(item.weightKg)}
                      value={openRealWeights[id] ?? ""}
                      onChange={(e) => setOpenRealWeights((prev) => ({ ...prev, [id]: e.target.value }))}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400 flex-shrink-0">kg</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Button
          size="operator"
          className="w-full"
          disabled={openSelected.length !== openCount}
          onClick={handleOpenSession}
        >
          BUKA {openCount} BOKS TERPILIH
        </Button>
      </Dialog>

      {/* Handoff Dialog */}
      <Dialog open={showHandoff} onClose={() => setShowHandoff(false)} title="Handoff Sisa TSG">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Timbang sisa TSG di boks &amp; batangan sementara. Shift berikutnya
            di mesin ini akan otomatis memakainya sebagai boks parsial.
          </p>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">
              Boks Aktif ({activeBoxes.length}):{" "}
              {activeBoxes.map((b) => `#${b.boxNumber} ${b.boxCode}`).join(", ") || "-"}
            </p>
          </div>
          <Input
            label="Sisa TSG (kg)"
            type="number"
            value={handoffSisa}
            onChange={(e) => setHandoffSisa(e.target.value)}
            placeholder="cth: 12.5"
            autoFocus
          />
          <Input
            label="Batangan Sementara (kg)"
            type="number"
            value={handoffBatangan}
            onChange={(e) => setHandoffBatangan(e.target.value)}
            placeholder="cth: 1.2"
          />
          <Input
            label="Catatan (opsional)"
            value={handoffNote}
            onChange={(e) => setHandoffNote(e.target.value)}
            placeholder="Sisa karena pergantian shift"
          />
          {actionMsg && (
            <div className={`rounded-lg p-3 text-sm ${actionMsg.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{actionMsg}</div>
          )}
          <Button
            size="operator"
            className="w-full"
            disabled={handoffSaving}
            onClick={async () => {
              if (!handoffSisa || !handoffBatangan) { setActionMsg("Isi sisa TSG dan batangan sementara."); return; }
              setHandoffSaving(true);
              setActionMsg("");
              try {
                await apiFetch(`/shifts/${shiftId}/handoff`, {
                  method: "POST",
                  body: JSON.stringify({
                    sisaTsgKg: parseFloat(handoffSisa),
                    batanganSementaraKg: parseFloat(handoffBatangan),
                    note: handoffNote || undefined,
                  }),
                });
                setActionMsg("✅ Handoff dibuat — sisa TSG siap untuk shift berikutnya.");
                setShowHandoff(false);
                setActiveBoxes([]);
                setActiveSession(null);
                loadData();
              } catch (e: any) {
                setActionMsg(e.message);
              } finally {
                setHandoffSaving(false);
              }
            }}
          >
            {handoffSaving ? "Menyimpan..." : "Simpan Handoff"}
          </Button>
        </div>
      </Dialog>

      {/* Consumption Dialog */}
      <Dialog open={showConsumption} onClose={() => setShowConsumption(false)} title="Tambah Pemakaian">
        <div className="space-y-4">
          {activeSession && (
            <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Dicatat untuk sesi aktif ({activeSession.boxes.length} boks)
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base" value={consForm.itemId} onChange={e => setConsForm({...consForm, itemId: e.target.value})}>
              <option value="">Pilih Item</option>
              {consumables.filter((c: any) => !c.allowAtEndShift).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>
              ))}
            </select>
          </div>
          <Input label="Quantity" type="number" value={consForm.qty} onChange={e => setConsForm({...consForm, qty: e.target.value})} />
          <Input label="Catatan (opsional)" value={consForm.note} onChange={e => setConsForm({...consForm, note: e.target.value})} />
          <Button
            size="operator"
            className="w-full"
            disabled={consSaving}
            onClick={async () => {
              if (!consForm.itemId || !consForm.qty || (!activeSession && !legacyActiveBox)) {
                setActionMsg("Pilih item, isi quantity, dan pastikan ada sesi/boks aktif.");
                return;
              }
              setConsSaving(true);
              try {
                const endpoint = activeSession
                  ? `/box-sessions/${activeSession.id}/consumption`
                  : `/boxes/${legacyActiveBox!.id}/consumption`;
                await apiFetch(endpoint, {
                  method: "POST",
                  body: JSON.stringify({
                    consumableItemId: consForm.itemId,
                    quantity: parseFloat(consForm.qty),
                    note: consForm.note || undefined,
                  }),
                });
                const item = consumables.find((c) => c.id === consForm.itemId);
                setConsumptionEvents(prev => [...prev, { item: item?.name ?? consForm.itemId, qty: consForm.qty, note: consForm.note, time: new Date().toLocaleTimeString("id-ID") }]);
                setActionMsg(`✅ Pemakaian ${item?.name ?? ""} dicatat`);
                setConsForm({ itemId: "", qty: "", note: "" });
                setShowConsumption(false);
              } catch (e: any) {
                setActionMsg(e.message);
              } finally {
                setConsSaving(false);
              }
            }}
          >
            {consSaving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Dialog>

      {/* Downtime Dialog */}
      <Dialog open={showDowntime} onClose={() => setShowDowntime(false)} title="Log Downtime">
        <div className="space-y-4">
          {activeSession && (
            <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Dicatat untuk sesi aktif ({activeSession.boxes.length} boks)
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base" value={downForm.cat} onChange={e => setDownForm({...downForm, cat: e.target.value})}>
              <option>GANTI_MATERIAL</option><option>KENDALA_MESIN</option><option>TUNGGU_BAHAN</option><option>ISTIRAHAT_IZIN</option><option>MAINTENANCE</option>
            </select>
          </div>
          <Input label="Durasi (menit)" type="number" value={downForm.dur} onChange={e => setDownForm({...downForm, dur: e.target.value})} />
          <Input label="Deskripsi (opsional)" value={downForm.desc} onChange={e => setDownForm({...downForm, desc: e.target.value})} />
          <Button size="operator" className="w-full" onClick={async () => {
            if (!downForm.dur) { setActionMsg("Isi durasi downtime"); return; }
            try {
              await apiFetch(`/shifts/${shiftId}/downtime`, {
                method: "POST",
                body: JSON.stringify({
                  category: downForm.cat,
                  durationMinutes: parseInt(downForm.dur),
                  linkedBoxId: activeSession ? undefined : legacyActiveBox?.id,
                  sessionId: activeSession?.id,
                  description: downForm.desc || undefined,
                }),
              });
              setDowntimeEvents(prev => [...prev, { cat: downForm.cat, dur: downForm.dur, desc: downForm.desc, time: new Date().toLocaleTimeString("id-ID") }]);
              setActionMsg(`✅ Downtime ${downForm.cat} (${downForm.dur} menit) dicatat`);
              setDownForm({ cat: "GANTI_MATERIAL", dur: "", desc: "" });
              setShowDowntime(false);
            } catch (e: any) {
              setActionMsg(e.message);
            }
          }}>Simpan</Button>
        </div>
      </Dialog>

      {/* Maintenance Dialog */}
      <Dialog open={showMaintenance} onClose={() => setShowMaintenance(false)} title="Log Maintenance / Sparepart">
        <div className="space-y-4">
          {activeSession && (
            <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Dicatat untuk sesi aktif ({activeSession.boxes.length} boks)
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sparepart</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base" value={mtnForm.partId} onChange={e => setMtnForm({...mtnForm, partId: e.target.value})}>
              <option value="">Pilih Sparepart</option>
              {spareparts.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
              ))}
            </select>
          </div>
          <Input label="Quantity" type="number" value={mtnForm.qty} onChange={e => setMtnForm({...mtnForm, qty: e.target.value})} placeholder="1" />
          <Input label="Catatan (opsional)" value={mtnForm.note} onChange={e => setMtnForm({...mtnForm, note: e.target.value})} />
          <Button
            size="operator"
            className="w-full"
            disabled={mtnSaving}
            onClick={async () => {
              if (!mtnForm.partId || !mtnForm.qty) { setActionMsg("Isi sparepart dan quantity"); return; }
              setMtnSaving(true);
              try {
                await apiFetch(`/shifts/${shiftId}/maintenance`, {
                  method: "POST",
                  body: JSON.stringify({
                    sparepartId: mtnForm.partId,
                    quantity: parseInt(mtnForm.qty),
                    linkedBoxId: activeSession ? undefined : legacyActiveBox?.id,
                    sessionId: activeSession?.id,
                    note: mtnForm.note || undefined,
                  }),
                });
                const part = spareparts.find((s) => s.id === mtnForm.partId);
                setMaintenanceEvents(prev => [...prev, { part: part?.name ?? mtnForm.partId, qty: mtnForm.qty, note: mtnForm.note, time: new Date().toLocaleTimeString("id-ID") }]);
                setActionMsg(`✅ Maintenance ${part?.name ?? ""} dicatat`);
                setMtnForm({ partId: "", qty: "", note: "" });
                setShowMaintenance(false);
              } catch (e: any) {
                setActionMsg(e.message);
              } finally {
                setMtnSaving(false);
              }
            }}
          >
            {mtnSaving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Dialog>

      {/* End Shift Dialog */}
      <Dialog open={showEndShift} onClose={() => setShowEndShift(false)} title="Akhiri Shift">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Isi 4 kategori waste dan catatan shift.
          </p>
          {["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"].map((cat) => (
            <div key={cat} className="flex items-center gap-4">
              <span className="w-32 text-sm font-medium">{cat.replace("_", " ")}</span>
              <Input
                type="number"
                placeholder="0.00 kg"
                className="flex-1"
                value={wasteForm[cat]?.kg ?? ""}
                onChange={(e) => setWasteForm(prev => ({ ...prev, [cat]: { ...(prev[cat] ?? { kg: "", status: "PENDING" }), kg: e.target.value } }))}
              />
              <select
                className="rounded-lg border border-gray-300 px-3 py-3 text-sm"
                value={wasteForm[cat]?.status ?? "PENDING"}
                onChange={(e) => setWasteForm(prev => ({ ...prev, [cat]: { ...(prev[cat] ?? { kg: "", status: "PENDING" }), status: e.target.value } }))}
              >
                <option>PENDING</option>
                <option>LUNAS</option>
              </select>
            </div>
          ))}
          <Input label="Catatan Shift (opsional)" value={endNotes} onChange={(e) => setEndNotes(e.target.value)} />

          {/* Pemakaian material tambahan (opsional) */}
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">📦 Pemakaian Material (opsional)</p>
              <span className="text-xs text-gray-400">{endConsumptions.length} item</span>
            </div>
            {endConsumptions.length === 0 ? (
              <p className="text-xs text-gray-400">Kosong — tambah material kalau ada (karton, dus, dll).</p>
            ) : (
              <div className="space-y-2 mb-2">
                {endConsumptions.map((c, i) => {
                  return (
                    <div key={i} className="flex items-center gap-2 rounded border border-gray-100 p-2">
                      <select
                        className="flex-1 rounded border border-gray-300 px-2 py-2 text-sm bg-white"
                        value={c.itemId}
                        onChange={(e) => { const next = [...endConsumptions]; next[i] = { ...next[i]!, itemId: e.target.value }; setEndConsumptions(next); }}
                      >
                        <option value="">Pilih Material</option>
                        {consumables.filter((cm: any) => cm.allowAtEndShift).map((cm: any) => <option key={cm.id} value={cm.id}>{cm.name} ({cm.unit})</option>)}
                      </select>
                      <Input
                        type="number"
                        value={c.qty}
                        onChange={(e) => { const next = [...endConsumptions]; next[i] = { ...next[i]!, qty: e.target.value }; setEndConsumptions(next); }}
                        placeholder="Qty"
                        className="w-24"
                      />
                      <button className="text-red-400 hover:text-red-600" onClick={() => setEndConsumptions(endConsumptions.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setEndConsumptions([...endConsumptions, { itemId: "", qty: "", note: "" }])}>
              + Tambah Material
            </Button>
          </div>

          {actionMsg && (
            <div className={`rounded-lg p-3 text-sm ${actionMsg.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{actionMsg}</div>
          )}
          <div className="flex gap-3">
            <Button size="lg" variant="outline" className="flex-1" onClick={() => setShowEndShift(false)} disabled={endShiftLoading}>
              Batal
            </Button>
            <Button
              size="lg"
              variant="danger"
              className="flex-1"
              disabled={endShiftLoading}
              onClick={async () => {
                setEndShiftLoading(true);
                setActionMsg("");
                try {
                  const waste = (["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"] as const).map((cat) => ({
                    category: cat,
                    kg: parseFloat(wasteForm[cat]?.kg || "0"),
                    settlementStatus: wasteForm[cat]?.status || "PENDING",
                  }));
                  const missingWaste = waste.filter(w => w.kg <= 0);
                  if (missingWaste.length === 4) {
                    setActionMsg("Isi minimal 1 kategori waste dengan nilai > 0.");
                    setEndShiftLoading(false);
                    return;
                  }
                  const consumptions = endConsumptions
                    .filter((c) => c.itemId && parseFloat(c.qty) > 0)
                    .map((c) => ({ consumableItemId: c.itemId, quantity: parseFloat(c.qty), note: c.note || undefined }));
                  await apiFetch(`/shifts/${shiftId}/end`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      waste,
                      notes: endNotes || undefined,
                      consumptions: consumptions.length > 0 ? consumptions : undefined,
                    }),
                  });
                  setShowEndShift(false);
                  router.push("/tablet");
                } catch (e: any) {
                  setActionMsg(e.message);
                } finally {
                  setEndShiftLoading(false);
                }
              }}
            >
              {endShiftLoading ? "Mengakhiri..." : "Akhiri Shift"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
