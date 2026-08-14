"use client";
import { apiFetch } from "@/lib/utils/api-client";

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
      const [detail, inv] = await Promise.all([
        apiFetch(`/shifts/${shiftId}`),
        apiFetch("/tsg-inventory/available?limit=50"),
      ]);
      setShiftData(detail);
      setApiInventory((inv.data ?? []).map((item: any) => ({ ...item, id: item.inventoryId ?? item.id })));
      // Set completed boxes from API
      if (detail?.boxes) {
        const completed = detail.boxes.filter((b: any) => b.completedAt).map((b: any) => ({
          id: b.id, boxNumber: b.boxNumber, boxCode: b.boxCode,
          tsgWeightKg: parseFloat(b.tsgWeightKg), outputWeightKg: parseFloat(b.outputWeightKg || "0"),
          yieldPct: parseFloat(b.yieldPct || "0"), isPartial: b.isPartial,
          openedAt: new Date(b.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          completedAt: b.completedAt ? new Date(b.completedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : undefined,
          indicator: b.yieldPct ? (parseFloat(b.yieldPct) >= 110 && parseFloat(b.yieldPct) <= 114 ? "NORMAL" as const : "WARNING" as const) : undefined,
        }));
        setCompletedBoxes(completed);
        // Check for active box
        const active = detail.boxes.find((b: any) => !b.completedAt);
        if (active) setActiveBox({
          id: active.id, boxNumber: active.boxNumber, boxCode: active.boxCode,
          tsgWeightKg: parseFloat(active.tsgWeightKg), isPartial: active.isPartial,
          openedAt: new Date(active.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        });
      }
    } catch { /* tetap pakai data kosong */ }
    finally { setDataLoading(false); }
  }, [shiftId]);

  useEffect(() => { loadData(); }, [loadData]);

  const inventoryList = apiInventory;

  // State
  const [activeBox, setActiveBox] = useState<BoxData | null>(null);
  const [completedBoxes, setCompletedBoxes] = useState<BoxData[]>([]);
  const [consumptionEvents, setConsumptionEvents] = useState<any[]>([]);
  const [downtimeEvents, setDowntimeEvents] = useState<any[]>([]);
  const [maintenanceEvents, setMaintenanceEvents] = useState<any[]>([]);
  const [actionMsg, setActionMsg] = useState("");

  // Dialog states
  const [showWeigh, setShowWeigh] = useState(false);
  const [showOpenBox, setShowOpenBox] = useState(false);
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

  // Weigh form
  const [outputWeight, setOutputWeight] = useState("");
  const yieldPreview = activeBox && outputWeight
    ? ((parseFloat(outputWeight) / activeBox.tsgWeightKg) * 100).toFixed(2)
    : null;
  const yieldIndicator = yieldPreview
    ? parseFloat(yieldPreview) >= 110 && parseFloat(yieldPreview) <= 114
      ? "NORMAL"
      : "WARNING"
    : null;

  const handleWeigh = async () => {
    if (activeBox && shiftId && shiftId !== "test-id") {
      try {
        const result = await apiFetch(`/boxes/${activeBox.id}`, {
          method: "PATCH",
          body: JSON.stringify({ outputWeightKg: parseFloat(outputWeight) }),
        });
        setCompletedBoxes(prev => [...prev, { ...activeBox, outputWeightKg: parseFloat(outputWeight), yieldPct: result.yieldPct, indicator: result.indicator, completedAt: new Date().toISOString() }]);
        loadData();
      } catch (e: any) { alert(e.message); }
    }
    setActiveBox(null);
    setShowWeigh(false);
    setOutputWeight("");
  };

  const handleOpenBox = async (inventoryId: string) => {
    if (shiftId && shiftId !== "test-id") {
      try {
        const result = await apiFetch(`/shifts/${shiftId}/boxes`, {
          method: "POST",
          body: JSON.stringify({ inventoryBoxId: inventoryId }),
        });
        setActiveBox({
          id: result.boxId,
          boxNumber: result.boxNumber,
          boxCode: result.boxCode,
          tsgWeightKg: parseFloat(result.tsgWeightKg),
          isPartial: result.isPartial,
          openedAt: new Date(result.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        });
        loadData();
      } catch (e: any) { alert(e.message); }
    }
    setShowOpenBox(false);
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

      {/* Active Box Card */}
      {activeBox ? (
        <Card highlight="green" className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="text-2xl">
                BOKS AKTIF #{activeBox.boxNumber}
              </CardTitle>
              <CardSubtitle>
                {activeBox.boxCode} · TSG {activeBox.tsgWeightKg} kg
                {activeBox.isPartial && (
                  <Badge variant="warning" className="ml-2">PARTIAL</Badge>
                )}
              </CardSubtitle>
            </div>
            <p className="text-sm text-gray-500">
              Dibuka: {activeBox.openedAt}
            </p>
          </div>

          {/* Tombol Besar: BOKS SELESAI */}
          <Button
            size="operator"
            variant="primary"
            className="w-full text-3xl"
            onClick={() => { setOutputWeight(String(activeBox.tsgWeightKg)); setShowWeigh(true); }}
          >
            BOKS SELESAI · TIMBANG HASIL BATANGAN
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
            onClick={() => setShowOpenBox(true)}
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
                    <span className="text-gray-400 ml-2 text-sm">
                      {box.openedAt} → {box.completedAt}
                    </span>
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
          onClick={() => setShowOpenBox(true)}
          disabled={!!activeBox}
        >
          BUKA BOKS BARU
        </Button>
        <Button
          size="xl"
          variant="danger"
          className="flex-1"
          onClick={() => setShowEndShift(true)}
          disabled={!!activeBox}
        >
          AKHIRI SHIFT
        </Button>
      </div>

      {/* ================================================================= */}
      {/* DIALOGS */}
      {/* ================================================================= */}

      {/* Weigh Box Dialog */}
      <Dialog open={showWeigh} onClose={() => setShowWeigh(false)} title="Timbang Hasil Boks">
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">TSG Input: {activeBox?.tsgWeightKg} kg</p>
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

      {/* Open Box Dialog — FIFO Inventory Picker */}
      <Dialog open={showOpenBox} onClose={() => setShowOpenBox(false)} title="Buka Boks Baru">
        <p className="text-sm text-gray-500 mb-4">
          Pilih boks dari inventory (FIFO — tertua di atas). Boks tertua disarankan.
        </p>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {inventoryList.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleOpenBox(item.id)}
              className={`w-full rounded-lg border-2 p-4 text-left transition-colors hover:border-primary-400 ${
                i === 0 ? "border-yellow-400 bg-yellow-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">
                    {i === 0 && " "}{item.boxCode}
                  </p>
                  <p className="text-sm text-gray-500">
                    {item.weightKg} kg · Umur {item.ageInDays} hari · {item.location}
                  </p>
                </div>
                {i === 0 && (
                  <Badge variant="warning">Disarankan (FIFO)</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      </Dialog>

      {/* Consumption Dialog */}
      <Dialog open={showConsumption} onClose={() => setShowConsumption(false)} title="Tambah Pemakaian">
        <div className="space-y-4">
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
              if (!consForm.itemId || !consForm.qty || !activeBox?.id) {
                setActionMsg("Pilih item, isi quantity, dan pastikan ada boks aktif.");
                return;
              }
              setConsSaving(true);
              try {
                await apiFetch(`/boxes/${activeBox.id}/consumption`, {
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
                  linkedBoxId: activeBox?.id,
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
