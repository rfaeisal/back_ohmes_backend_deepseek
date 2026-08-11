"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: { message: res.statusText } })); throw new Error(err.error?.message ?? res.statusText); }
  return res.json();
}

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

const MOCK_INVENTORY = [
  { id: "inv_001", boxCode: "TSG-20260808-042", weightKg: 29.70, ageInDays: 3, location: "RAK-A-01" },
  { id: "inv_002", boxCode: "TSG-20260809-011", weightKg: 30.05, ageInDays: 2, location: "RAK-A-02" },
  { id: "inv_003", boxCode: "TSG-20260810-005", weightKg: 29.85, ageInDays: 1, location: "RAK-A-01" },
];

// =============================================================================
// Page Component
// =============================================================================

export default function ShiftActivePage() {
  const router = useRouter();
  const params = useParams();
  const shiftId = params?.id as string;

  // Real data from API (used when real shift ID is provided)
  const [_shiftData, setShiftData] = useState<any>(null);
  const [apiInventory, setApiInventory] = useState<any[]>([]);
  const [_dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!shiftId || shiftId === "test-id") { setDataLoading(false); return; }
    try {
      const [detail, inv] = await Promise.all([
        apiFetch(`/shifts/${shiftId}`),
        apiFetch("/tsg-inventory/available?limit=10"),
      ]);
      setShiftData(detail);
      setApiInventory(inv.data ?? []);
    } catch { /* gunakan mock data */ }
    finally { setDataLoading(false); }
  }, [shiftId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Use API inventory if available, otherwise mock
  const inventoryList = apiInventory.length > 0 ? apiInventory : MOCK_INVENTORY;

  // State
  const [activeBox, setActiveBox] = useState<BoxData | null>({
    id: "box_01",
    boxNumber: 5,
    boxCode: "TSG-20260810-012",
    tsgWeightKg: 29.70,
    isPartial: false,
    openedAt: "17:15",
  });
  const [completedBoxes] = useState<BoxData[]>([
    { id: "box_00", boxNumber: 1, boxCode: "TSG-20260810-008", tsgWeightKg: 29.80, isPartial: false, openedAt: "16:35", completedAt: "17:12", outputWeightKg: 33.15, yieldPct: 111.24, indicator: "NORMAL" },
    { id: "box_02", boxNumber: 2, boxCode: "TSG-20260810-009", tsgWeightKg: 30.10, isPartial: false, openedAt: "17:15", completedAt: "17:48", outputWeightKg: 33.45, yieldPct: 111.13, indicator: "NORMAL" },
  ]);

  // Dialog states
  const [showWeigh, setShowWeigh] = useState(false);
  const [showOpenBox, setShowOpenBox] = useState(false);
  const [showConsumption, setShowConsumption] = useState(false);
  const [showDowntime, setShowDowntime] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);

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
        await apiFetch(`/boxes/${activeBox.id}`, {
          method: "PATCH",
          body: JSON.stringify({ outputWeightKg: parseFloat(outputWeight) }),
        });
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
        await apiFetch(`/shifts/${shiftId}/boxes`, {
          method: "POST",
          body: JSON.stringify({ inventoryBoxId: inventoryId }),
        });
        loadData();
      } catch (e: any) { alert(e.message); }
    } else {
      // Fallback mock
      const box = MOCK_INVENTORY.find((b) => b.id === inventoryId);
      if (box) {
        setActiveBox({
          id: `box_${Date.now()}`,
          boxNumber: completedBoxes.length + 2,
          boxCode: box.boxCode,
          tsgWeightKg: box.weightKg,
          isPartial: false,
          openedAt: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        });
      }
    }
    setShowOpenBox(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            SHIFT MALAM · MKR-01
          </h1>
          <p className="text-lg text-gray-500 mt-1">
            Hummer STD &nbsp;·&nbsp; Mulai 16:30 &nbsp;·&nbsp; Sudah berjalan 1j 15m
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Tim: Alfi (Ketua), Ahmadi, Didik, Zaini
          </p>
        </div>
        <Badge variant="success">RUNNING</Badge>
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
            onClick={() => setShowWeigh(true)}
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

      {/* Ringkasan */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-xs text-gray-500">Boks Selesai</p>
          <p className="text-2xl font-bold">{completedBoxes.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Yield Rata-rata</p>
          <p className="text-2xl font-bold text-green-700">111.2%</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Downtime</p>
          <p className="text-2xl font-bold text-yellow-700">8 mnt</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Consumables</p>
          <p className="text-2xl font-bold">2 event</p>
        </Card>
      </div>

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
            disabled={!outputWeight || parseFloat(outputWeight) <= 0}
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
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base">
              <option>Bobbin Hummer</option>
              <option>Filter Hummer</option>
              <option>Tipping Hummer</option>
              <option>Lem Hummer</option>
            </select>
          </div>
          <Input label="Quantity" type="number" inputMode="decimal" />
          <Input label="Catatan (opsional)" />
          <Button size="operator" className="w-full" onClick={() => setShowConsumption(false)}>
            Simpan
          </Button>
        </div>
      </Dialog>

      {/* Downtime Dialog */}
      <Dialog open={showDowntime} onClose={() => setShowDowntime(false)} title="Log Downtime">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base">
              <option>GANTI_MATERIAL</option>
              <option>KENDALA_MESIN</option>
              <option>TUNGGU_BAHAN</option>
              <option>ISTIRAHAT_IZIN</option>
              <option>MAINTENANCE</option>
            </select>
          </div>
          <Input label="Durasi (menit)" type="number" inputMode="numeric" />
          <Input label="Deskripsi (opsional)" />
          <Button size="operator" className="w-full" onClick={() => setShowDowntime(false)}>
            Simpan
          </Button>
        </div>
      </Dialog>

      {/* Maintenance Dialog */}
      <Dialog open={showMaintenance} onClose={() => setShowMaintenance(false)} title="Log Maintenance / Sparepart">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sparepart</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base">
              <option>Pisau Filter</option>
              <option>Nylon</option>
              <option>Belt Maker</option>
            </select>
          </div>
          <Input label="Quantity" type="number" inputMode="numeric" placeholder="1" />
          <Input label="Catatan (opsional)" placeholder="Preventive maintenance..." />
          <Button size="operator" className="w-full" onClick={() => setShowMaintenance(false)}>
            Simpan
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
              <Input type="number" placeholder="0.00 kg" className="flex-1" />
              <select className="rounded-lg border border-gray-300 px-3 py-3 text-sm">
                <option>PENDING</option>
                <option>LUNAS</option>
              </select>
            </div>
          ))}
          <Input label="Catatan Shift (opsional)" />
          <div className="flex gap-3">
            <Button size="lg" variant="outline" className="flex-1" onClick={() => setShowEndShift(false)}>
              Batal
            </Button>
            <Button
              size="lg"
              variant="danger"
              className="flex-1"
              onClick={() => {
                setShowEndShift(false);
                router.push("/tablet");
              }}
            >
              Akhiri Shift
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
