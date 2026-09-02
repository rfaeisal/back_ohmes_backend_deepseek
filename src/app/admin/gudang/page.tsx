"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";

export default function GudangInboundPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [pendingReceivings, setPendingReceivings] = useState<any[]>([]);
  const [showReceiving, setShowReceiving] = useState(false);

  const loadInventory = async () => {
    try {
      const data = await apiFetch("/tsg-inventory/available?limit=200");
      const items = (data.data ?? []).map((item: any) => ({ ...item, status: "AVAILABLE", id: item.inventoryId ?? item.id }));
      setInventory(items);
    } catch {}
  };

  useEffect(() => { loadInventory(); loadTransfers(); loadReturns(); loadPendingReceivings(); loadExtReceivings(); }, []);

  // Receiving manual (tanpa SJ) → PENDING sampai di-approve
  const loadPendingReceivings = async () => {
    try {
      const res = await apiFetch("/tsg-receiving");
      setPendingReceivings((res.data ?? []).filter((r: any) => r.approvalStatus === "PENDING"));
    } catch { setPendingReceivings([]); }
  };

  const approveReceiving = async (id: string) => {
    try {
      await apiFetch(`/tsg-receiving/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
      loadPendingReceivings();
      loadInventory();
    } catch (e: any) { alert(e.message); }
  };
  const [receivingBoxes, setReceivingBoxes] = useState<Array<{ code: string; weight: string; type: string }>>([
    { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" },
  ]);
  const [saving, setSaving] = useState(false);
  const [receivingError, setReceivingError] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [tsgDocRef, setTsgDocRef] = useState("");
  const [tsgNotes, setTsgNotes] = useState("");
  const [tsgIsMakloon, setTsgIsMakloon] = useState(false);
  const [tsgMakloonCustomer, setTsgMakloonCustomer] = useState("");
  const [tsgMakloonTarget, setTsgMakloonTarget] = useState("");
  const [editLocId, setEditLocId] = useState<string | null>(null);
  const [editLocValue, setEditLocValue] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("AVAILABLE");

  // Material & sparepart receiving
  const [showMaterialReceiving, setShowMaterialReceiving] = useState(false);
  const [matType, setMatType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [matItems, setMatItems] = useState<Array<{ itemId: string; qty: string; price: string }>>([{ itemId: "", qty: "", price: "" }]);
  const [matDocRef, setMatDocRef] = useState("");
  const [matNotes, setMatNotes] = useState("");
  const [matError, setMatError] = useState("");
  const [matSaving, setMatSaving] = useState(false);
  const [consumableList, setConsumableList] = useState<any[]>([]);
  const [sparepartList, setSparepartList] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);

  const loadMaterialItems = async (type: "CONSUMABLE" | "SPAREPART") => {
    try {
      const path = type === "CONSUMABLE" ? "/consumable-items" : "/spareparts";
      const data = await apiFetch(path);
      if (type === "CONSUMABLE") setConsumableList(data.data ?? []);
      else setSparepartList(data.data ?? []);
    } catch {}
  };

  const loadMachines = async () => {
    try {
      const data = await apiFetch("/machines");
      setMachines(data.data ?? []);
    } catch {}
  };

  // Buka dokumen PDF (Berita Acara) di tab baru — murni PDF tanpa sidebar
  const openDoc = async (path: string) => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { alert("Gagal membuka dokumen."); return; }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch { alert("Gagal membuka dokumen."); }
  };

  // TSG transfer ke pabrik lain
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferDest, setTransferDest] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferSelected, setTransferSelected] = useState<Set<string>>(new Set());
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferHistory, setTransferHistory] = useState<any[]>([]);

  const loadTransfers = async () => {
    try {
      const data = await apiFetch("/tsg-transfers");
      setTransferHistory(data.data ?? []);
    } catch {}
  };

  const handleSaveTransfer = async () => {
    if (!transferDest.trim()) { setTransferError("Nama pabrik tujuan wajib diisi."); return; }
    if (transferSelected.size === 0) { setTransferError("Pilih minimal 1 boks."); return; }
    setTransferSaving(true);
    setTransferError("");
    try {
      await apiFetch("/tsg-transfers", {
        method: "POST",
        body: JSON.stringify({
          destinationName: transferDest.trim(),
          inventoryBoxIds: Array.from(transferSelected),
          notes: transferNotes || undefined,
        }),
      });
      setShowTransfer(false);
      setTransferSelected(new Set());
      loadInventory();
      loadTransfers();
    } catch (e: any) { setTransferError(e.message); }
    finally { setTransferSaving(false); }
  };

  // TSG retur ke supplier
  const [showReturn, setShowReturn] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSelected, setReturnSelected] = useState<Set<string>>(new Set());
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [returnHistory, setReturnHistory] = useState<any[]>([]);
  // Filter supplier asal boks di dialog retur
  const [returnSupplierFilter, setReturnSupplierFilter] = useState("");

  // Supplier asal boks (distinct dari inventory AVAILABLE)
  const returnOriginSuppliers = Array.from(
    new Map(
      inventory
        .filter((i) => i.supplierId)
        .map((i) => [i.supplierId, i.supplierName ?? "-"])
    ).entries()
  );
  const returnFilteredInventory = returnSupplierFilter
    ? inventory.filter((i) => i.supplierId === returnSupplierFilter)
    : inventory;

  const loadReturns = async () => {
    try {
      const data = await apiFetch("/tsg-returns");
      setReturnHistory(data.data ?? []);
    } catch {}
  };

  const handleSaveReturn = async () => {
    if (!returnSupplierId) { setReturnError("Pilih supplier dulu."); return; }
    if (!returnReason.trim() || returnReason.trim().length < 3) { setReturnError("Alasan retur wajib diisi (min 3 karakter)."); return; }
    if (returnSelected.size === 0) { setReturnError("Pilih minimal 1 boks."); return; }
    setReturnSaving(true);
    setReturnError("");
    try {
      await apiFetch("/tsg-returns", {
        method: "POST",
        body: JSON.stringify({
          supplierId: returnSupplierId,
          inventoryBoxIds: Array.from(returnSelected),
          reason: returnReason.trim(),
          notes: returnNotes || undefined,
        }),
      });
      setShowReturn(false);
      setReturnSelected(new Set());
      loadInventory();
      loadReturns();
    } catch (e: any) { setReturnError(e.message); }
    finally { setReturnSaving(false); }
  };

  // Makloon: penerimaan batangan external (docs/24) — PENDING → approve/reject
  const [extReceivings, setExtReceivings] = useState<any[]>([]);
  const [showExtReceive, setShowExtReceive] = useState(false);
  const [extSender, setExtSender] = useState("");
  const [extDocRef, setExtDocRef] = useState("");
  const [extKg, setExtKg] = useState("");
  const [extEntryStage, setExtEntryStage] = useState<"BATANGAN" | "PACK" | "PACK_WRAPPED" | "SLOP" | "BAL">("BATANGAN");
  const [extNotes, setExtNotes] = useState("");
  const [extSaving, setExtSaving] = useState(false);
  const [extError, setExtError] = useState("");
  const [rejectExtId, setRejectExtId] = useState<string | null>(null);
  const [rejectExtReason, setRejectExtReason] = useState("");

  const loadExtReceivings = async () => {
    try {
      const res = await apiFetch("/external-receivings?status=PENDING");
      setExtReceivings(res.data ?? []);
    } catch { setExtReceivings([]); }
  };

  const handleSubmitExtReceive = async () => {
    if (!extSender.trim()) { setExtError("Nama pengirim wajib diisi."); return; }
    const kg = parseFloat(extKg);
    if (isNaN(kg) || kg <= 0) { setExtError("Berat batangan wajib diisi (kg)."); return; }
    setExtSaving(true);
    setExtError("");
    try {
      await apiFetch("/external-receivings", {
        method: "POST",
        body: JSON.stringify({
          senderName: extSender.trim(),
          docRef: extDocRef || undefined,
          batanganKg: kg,
          entryStage: extEntryStage,
          notes: extNotes || undefined,
        }),
      });
      setShowExtReceive(false);
      setExtSender(""); setExtDocRef(""); setExtKg(""); setExtNotes("");
      loadExtReceivings();
    } catch (e: any) { setExtError(e.message); }
    finally { setExtSaving(false); }
  };

  const handleApproveExt = async (id: string) => {
    try {
      const res = await apiFetch(`/external-receivings/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
      alert(`✅ Disetujui — batch ${res.batchCode} siap diproses HLP.`);
      loadExtReceivings();
    } catch (e: any) { alert(e.message); }
  };

  const handleRejectExt = async () => {
    if (!rejectExtId) return;
    try {
      await apiFetch(`/external-receivings/${rejectExtId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectExtReason }),
      });
      setRejectExtId(null);
      setRejectExtReason("");
      loadExtReceivings();
    } catch (e: any) { alert(e.message); }
  };

  // Material out (kirim pabrik lain / retur supplier)
  const [showMatOut, setShowMatOut] = useState(false);
  const [matOutType, setMatOutType] = useState<"CONSUMABLE" | "SPAREPART">("CONSUMABLE");
  const [matOutFlow, setMatOutFlow] = useState<"TRANSFER" | "RETUR" | "PEMAKAIAN" | "RUSAK">("TRANSFER");
  const [matOutMachine, setMatOutMachine] = useState("");
  const [matOutCounterpart, setMatOutCounterpart] = useState("");
  const [matOutReason, setMatOutReason] = useState("");
  const [matOutItems, setMatOutItems] = useState<Array<{ itemId: string; qty: string }>>([{ itemId: "", qty: "" }]);
  const [matOutError, setMatOutError] = useState("");
  const [matOutSaving, setMatOutSaving] = useState(false);

  const handleSaveMaterialOut = async () => {
    const validItems = matOutItems.filter((i) => i.itemId && parseFloat(i.qty) > 0);
    if (matOutFlow === "PEMAKAIAN") {
      if (!matOutMachine) { setMatOutError("Pilih mesin tujuan untuk pemakaian produksi."); return; }
    } else if (matOutFlow !== "RUSAK" && !matOutCounterpart.trim()) {
      setMatOutError("Tujuan/supplier wajib diisi."); return;
    }
    if (!matOutReason.trim() || matOutReason.trim().length < 3) { setMatOutError("Alasan wajib diisi (min 3 karakter)."); return; }
    if (validItems.length === 0) { setMatOutError("Minimal 1 item dengan quantity > 0."); return; }
    setMatOutSaving(true);
    setMatOutError("");
    try {
      await apiFetch("/material-out", {
        method: "POST",
        body: JSON.stringify({
          materialType: matOutType,
          outType: matOutFlow,
          counterpartName: matOutCounterpart.trim(),
          machineId: matOutFlow === "PEMAKAIAN" ? matOutMachine : undefined,
          reason: matOutReason.trim(),
          items: validItems.map((i) => ({ itemId: i.itemId, quantity: parseFloat(i.qty) })),
        }),
      });
      setShowMatOut(false);
    } catch (e: any) { setMatOutError(e.message); }
    finally { setMatOutSaving(false); }
  };

  const handleSaveMaterialReceiving = async () => {
    const validItems = matItems.filter((i) => i.itemId && parseFloat(i.qty) > 0);
    if (validItems.length === 0) { setMatError("Minimal 1 item dengan quantity > 0."); return; }
    if (!selectedSupplier) { setMatError("Pilih supplier dulu."); return; }
    setMatSaving(true);
    setMatError("");
    try {
      await apiFetch("/material-receiving", {
        method: "POST",
        body: JSON.stringify({
          supplierId: selectedSupplier,
          materialType: matType,
          supplierDocRef: matDocRef || undefined,
          notes: matNotes || undefined,
          items: validItems.map((i) => ({ itemId: i.itemId, quantity: parseFloat(i.qty), unitPrice: i.price ? parseFloat(i.price) : undefined })),
        }),
      });
      setShowMaterialReceiving(false);
    } catch (e: any) { setMatError(e.message); }
    finally { setMatSaving(false); }
  };

  const saveLocation = async (inventoryId: string) => {
    try {
      await apiFetch(`/tsg-inventory/${inventoryId}`, {
        method: "PATCH",
        body: JSON.stringify({ locationCode: editLocValue }),
      });
      setEditLocId(null); loadInventory();
    } catch {}
  };

  const loadSuppliers = async () => {
    try {
      const data = await apiFetch("/tsg-suppliers");
      setSuppliers(data.data ?? []);
      if (data.data?.length > 0) setSelectedSupplier(data.data[0].id);
    } catch {}
  };

  const handleSaveReceiving = async () => {
    const validBoxes = receivingBoxes.filter(b => b.code && b.weight);
    if (validBoxes.length === 0) { setReceivingError("Minimal 1 boks dengan kode & berat."); return; }
    if (!selectedSupplier) { setReceivingError("Pilih supplier dulu."); return; }
    setSaving(true); setReceivingError("");
    try {
      await apiFetch("/tsg-receiving", {
        method: "POST",
        body: JSON.stringify({
          supplierId: selectedSupplier,
          locationCode: locationCode || undefined,
          supplierDocRef: tsgDocRef || undefined,
          notes: tsgNotes || undefined,
          isMakloon: tsgIsMakloon,
          makloonCustomer: tsgMakloonCustomer || undefined,
          makloonTarget: tsgMakloonTarget || undefined,
          boxes: validBoxes.map(b => ({ boxCode: b.code, weightKg: parseFloat(b.weight), tsgType: b.type })),
        }),
      });
      setShowReceiving(false);
      setReceivingBoxes([{ code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }]);
      loadInventory();
      loadPendingReceivings();
    } catch (e: any) { setReceivingError(e.message); }
    finally { setSaving(false); }
  };

  const filtered = inventory.filter((i) => filterStatus === "ALL" || i.status === filterStatus);

  const statusBadge = (status: string) => {
    const map: Record<string, "success" | "warning" | "info" | "error"> = {
      AVAILABLE: "success",
      ALLOCATED: "warning",
      USED: "info",
      WRITTEN_OFF: "error",
    };
    return <Badge variant={map[status] ?? "neutral"}>{status}</Badge>;
  };

  const ageBadge = (age: number) => {
    if (age > 30) return <Badge variant="error">{age} hari ⚠️</Badge>;
    if (age > 14) return <Badge variant="warning">{age} hari</Badge>;
    return <span className="text-sm text-gray-500">{age} hari</span>;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gudang Inbound</h1>
          <p className="text-lg text-gray-500 mt-1">
            Terima TSG dari supplier · Inventory FIFO
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/admin/labels">
            <Button size="xl" variant="outline">
              <Printer className="size-5 mr-2" /> Cetak Label
            </Button>
          </Link>
          <Button size="xl" onClick={() => { loadSuppliers(); setLocationCode(""); setTsgDocRef(""); setTsgNotes(""); setTsgIsMakloon(false); setTsgMakloonCustomer(""); setTsgMakloonTarget(""); setReceivingBoxes([{ code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }, { code: "", weight: "", type: "REGULER" }]); setReceivingError(""); setShowReceiving(true); }}>
            🚛 Terima TSG Baru
          </Button>
          <Button size="xl" variant="outline" onClick={() => { loadSuppliers(); setMatType("CONSUMABLE"); setMatItems([{ itemId: "", qty: "", price: "" }]); setMatDocRef(""); setMatNotes(""); setMatError(""); setShowMaterialReceiving(true); }}>
            📦 Terima Material & Sparepart
          </Button>
          <Button size="xl" variant="outline" onClick={() => { setTransferDest(""); setTransferNotes(""); setTransferSelected(new Set()); setTransferError(""); setShowTransfer(true); }}>
            🚚 Kirim TSG ke Pabrik Lain
          </Button>
          <Button size="xl" variant="outline" onClick={() => { loadSuppliers(); setReturnReason(""); setReturnNotes(""); setReturnSelected(new Set()); setReturnSupplierId(""); setReturnSupplierFilter(""); setReturnError(""); setShowReturn(true); }}>
            ↩️ Retur TSG ke Supplier
          </Button>
          <Button size="xl" variant="outline" onClick={() => { setMatOutFlow("TRANSFER"); setMatOutMachine(""); setMatOutCounterpart(""); setMatOutReason(""); setMatOutItems([{ itemId: "", qty: "" }]); setMatOutError(""); loadMaterialItems(matOutType); loadMachines(); setShowMatOut(true); }}>
            📤 Keluar Material & Sparepart
          </Button>
          <Button size="xl" variant="outline" onClick={() => { setExtSender(""); setExtDocRef(""); setExtKg(""); setExtEntryStage("BATANGAN"); setExtNotes(""); setExtError(""); setShowExtReceive(true); }}>
            🏭 Terima Batangan External (Makloon)
          </Button>
        </div>
      </div>

      {/* Batangan external menunggu approval */}
      {extReceivings.length > 0 && (
        <div className="mb-6 rounded-lg border border-purple-300 bg-purple-50 p-4">
          <p className="font-bold text-purple-800 mb-2">🏭 Batangan External Menunggu Approval ({extReceivings.length})</p>
          {extReceivings.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-purple-200 py-2 last:border-0">
              <div>
                <span className="font-semibold">{r.senderName}</span>
                <span className="text-sm text-gray-600 ml-2">{Number(r.batanganKg)} {r.entryUnit ?? "kg"}</span>
                <span className="text-xs text-gray-400 ml-2">stage: {r.entryStage ?? "BATANGAN"}</span>
                {r.docRef && <span className="text-xs text-gray-400 ml-2">Ref: {r.docRef}</span>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setRejectExtId(r.id); setRejectExtReason(""); }}>Tolak</Button>
                <Button size="sm" onClick={() => handleApproveExt(r.id)}>Approve → Batch</Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-purple-700 mt-2">Approve membuat batch EXTERNAL (btx_) yang langsung bisa diproses mesin HLP.</p>
        </div>
      )}

      {/* Receiving menunggu approval (manual tanpa Surat Jalan) */}
      {pendingReceivings.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="font-bold text-yellow-800 mb-2">⏳ Receiving Menunggu Approval ({pendingReceivings.length})</p>
          {pendingReceivings.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-yellow-200 py-2 last:border-0">
              <div>
                <span className="font-mono font-semibold">{r.receivingCode}</span>
                <span className="text-sm text-gray-600 ml-2">{r.totalBoxCount} boks · {r.totalWeightKg} kg</span>
                {r.supplierDocRef && <span className="text-xs text-gray-400 ml-2">SJ: {r.supplierDocRef}</span>}
              </div>
              <Button size="sm" onClick={() => approveReceiving(r.id)}>Approve → Inventory</Button>
            </div>
          ))}
          <p className="text-xs text-yellow-700 mt-2">Boks masuk inventory setelah approval (perlu permission tsg.receiving.approve).</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "AVAILABLE", count: inventory.filter((i) => i.status === "AVAILABLE").length, color: "text-green-700" },
          { label: "ALLOCATED", count: inventory.filter((i) => i.status === "ALLOCATED").length, color: "text-yellow-700" },
          { label: "USED", count: inventory.filter((i) => i.status === "USED").length, color: "text-blue-700" },
          { label: "TOTAL", count: inventory.length, color: "text-gray-700" },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["AVAILABLE", "ALLOCATED", "USED", "WRITTEN_OFF", "ALL"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Inventory Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Kode Boks</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Jenis</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Berat</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Umur</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Lokasi</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">Stok kosong. Terima TSG dulu dengan klik 🚛 Terima TSG Baru.</td></tr>
              ) : filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{item.boxCode}</td>
                  <td className="py-3"><Badge variant={item.tsgType === "REGULER" ? "info" : item.tsgType === "MILD" ? "success" : "warning"}>{item.tsgType ?? "REGULER"}</Badge></td>
                  <td className="py-3">{item.weightKg} kg</td>
                  <td className="py-3">{ageBadge(item.ageInDays)}</td>
                  <td className="py-3 text-sm text-gray-500">
                    {editLocId === item.id ? (
                      <div className="flex gap-1">
                        <input className="w-24 rounded border px-2 py-1 text-sm" value={editLocValue} onChange={e => setEditLocValue(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && saveLocation(item.id)} />
                        <button className="text-green-600 text-xs font-bold" onClick={() => saveLocation(item.id)}>✓</button>
                        <button className="text-red-400 text-xs" onClick={() => setEditLocId(null)}>✕</button>
                      </div>
                    ) : (
                      <span className="cursor-pointer hover:underline" onClick={() => { setEditLocId(item.id); setEditLocValue(item.locationCode ?? ""); }}>{item.locationCode ?? "Klik untuk isi"}</span>
                    )}
                  </td>
                  <td className="py-3">{statusBadge(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Receiving Dialog */}
      <Dialog
        open={showReceiving}
        onClose={() => setShowReceiving(false)}
        title="Terima TSG dari Supplier"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                {suppliers.length === 0 && <option value="">Memuat...</option>}
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <Input label="No Surat Jalan Supplier" placeholder="Opsional" value={tsgDocRef} onChange={e => setTsgDocRef(e.target.value)} />
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 py-1">
              <input
                type="checkbox"
                checked={tsgIsMakloon}
                onChange={(e) => setTsgIsMakloon(e.target.checked)}
                className="size-4"
              />
              TSG milik makloon (jejak sampai produk akhir)
            </label>
            {tsgIsMakloon && (
              <>
                <Input label="Pemesan Makloon" placeholder="cth: PT Makloon Jaya" value={tsgMakloonCustomer} onChange={e => setTsgMakloonCustomer(e.target.value)} />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Produk Jadi Pesanan</label>
                  <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={tsgMakloonTarget} onChange={(e) => setTsgMakloonTarget(e.target.value)}>
                    <option value="">Pilih produk jadi</option>
                    <option value="PACK">PACK</option>
                    <option value="PACK_WRAP">PACK TERWRAP</option>
                    <option value="SLOP">SLOP</option>
                    <option value="BAL">BAL</option>
                    <option value="KARTON">KARTON</option>
                  </select>
                </div>
              </>
            )}
            <Input label="Lokasi Rak" placeholder="RAK-A-01" value={locationCode} onChange={e => setLocationCode(e.target.value)} />
          </div>

          <Input label="Catatan (opsional)" placeholder="cth: Reproses rijekan shift 14/08 — hasil olahan" value={tsgNotes} onChange={e => setTsgNotes(e.target.value)} />
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Daftar Boks</h3>
              <span className="text-sm text-gray-500">{receivingBoxes.length} boks</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {receivingBoxes.map((box, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                  <span className="w-8 text-center font-bold text-gray-400">{i + 1}</span>
                  <Input
                    value={box.code}
                    onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, code: e.target.value }; setReceivingBoxes(next); }}
                    placeholder={`TSG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`}
                    className="flex-1"
                  />
                  <Input type="number" value={box.weight} onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, weight: e.target.value }; setReceivingBoxes(next); }} placeholder="0.00" className="w-28" />
                  <select className="w-28 rounded-lg border border-gray-300 px-2 py-3 text-sm bg-white" value={box.type} onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, type: e.target.value }; setReceivingBoxes(next); }}>
                    <option value="REGULER">Reguler</option>
                    <option value="MILD">Mild</option>
                    <option value="PUTIHAN">Putihan</option>
                  </select>
                  {receivingBoxes.length > 1 && (
                    <button className="text-red-400 hover:text-red-600" onClick={() => setReceivingBoxes(receivingBoxes.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setReceivingBoxes([...receivingBoxes, { code: "", weight: "", type: "REGULER" }])}>
              + Tambah Boks
            </Button>
          </div>

          {receivingError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{receivingError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveReceiving} disabled={saving}>
            {saving ? "Menyimpan..." : `Simpan · ${receivingBoxes.filter(b => b.code && b.weight).length} Boks`}
          </Button>
        </div>
      </Dialog>

      {/* Material & Sparepart Receiving Dialog */}
      <Dialog
        open={showMaterialReceiving}
        onClose={() => setShowMaterialReceiving(false)}
        title="Terima Material & Sparepart"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          {/* Toggle jenis */}
          <div className="flex gap-2">
            {(["CONSUMABLE", "SPAREPART"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setMatType(t); setMatItems([{ itemId: "", qty: "", price: "" }]); loadMaterialItems(t); }}
                className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                  matType === t ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t === "CONSUMABLE" ? "🧵 Consumable (Bahan)" : "🔧 Sparepart (Suku Cadang)"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                {suppliers.length === 0 && <option value="">Memuat...</option>}
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <Input label="No Surat Jalan Supplier" value={matDocRef} onChange={e => setMatDocRef(e.target.value)} placeholder="Opsional" />
            <Input label="Catatan" value={matNotes} onChange={e => setMatNotes(e.target.value)} placeholder="Opsional" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Daftar Item</h3>
              <span className="text-sm text-gray-500">{matItems.length} item</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {matItems.map((item, i) => {
                const list = matType === "CONSUMABLE" ? consumableList : sparepartList;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                    <span className="w-8 text-center font-bold text-gray-400">{i + 1}</span>
                    <select
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-3 text-sm bg-white"
                      value={item.itemId}
                      onChange={e => { const next = [...matItems]; next[i] = { ...next[i]!, itemId: e.target.value }; setMatItems(next); }}
                    >
                      <option value="">Pilih {matType === "CONSUMABLE" ? "Item" : "Sparepart"}</option>
                      {list.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                    </select>
                    <Input
                      type="number"
                      value={item.qty}
                      onChange={e => { const next = [...matItems]; next[i] = { ...next[i]!, qty: e.target.value }; setMatItems(next); }}
                      placeholder="Qty"
                      className="w-24"
                    />
                    <Input
                      type="number"
                      value={item.price}
                      onChange={e => { const next = [...matItems]; next[i] = { ...next[i]!, price: e.target.value }; setMatItems(next); }}
                      placeholder="Harga/unit"
                      className="w-32"
                    />
                    {matItems.length > 1 && (
                      <button className="text-red-400 hover:text-red-600" onClick={() => setMatItems(matItems.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setMatItems([...matItems, { itemId: "", qty: "", price: "" }])}>
              + Tambah Item
            </Button>
          </div>

          {matError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{matError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveMaterialReceiving} disabled={matSaving}>
            {matSaving ? "Menyimpan..." : `Simpan · ${matItems.filter(i => i.itemId && parseFloat(i.qty) > 0).length} Item`}
          </Button>
        </div>
      </Dialog>

      {/* Kirim TSG ke Pabrik Lain Dialog */}
      <Dialog
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
        title="Kirim TSG ke Pabrik Lain"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Pabrik Tujuan" value={transferDest} onChange={e => setTransferDest(e.target.value)} placeholder="cth: Pabrik Pamekasan" />
            <Input label="Catatan (opsional)" value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="Alasan pengiriman" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Pilih Boks TSG</h3>
              <span className="text-sm text-gray-500">{transferSelected.size} boks dipilih</span>
            </div>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {inventory.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Tidak ada boks AVAILABLE.</p>
              ) : inventory.map((item) => (
                <label key={item.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={transferSelected.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(transferSelected);
                      if (e.target.checked) next.add(item.id); else next.delete(item.id);
                      setTransferSelected(next);
                    }}
                    className="size-4"
                  />
                  <span className="font-mono text-sm">{item.boxCode}</span>
                  <span className="text-sm text-gray-500">{item.weightKg} kg</span>
                  <span className="text-sm text-gray-400">{item.tsgType}</span>
                </label>
              ))}
            </div>
          </div>

          {transferError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{transferError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveTransfer} disabled={transferSaving}>
            {transferSaving ? "Menyimpan..." : `Kirim · ${transferSelected.size} Boks`}
          </Button>
        </div>
      </Dialog>

      {/* Retur TSG ke Supplier Dialog */}
      <Dialog
        open={showReturn}
        onClose={() => setShowReturn(false)}
        title="Retur TSG ke Supplier"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={returnSupplierId} onChange={e => setReturnSupplierId(e.target.value)}>
                <option value="">Pilih Supplier</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <Input label="Alasan Retur *" value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="cth: Boks cacat / kadar air tinggi / salah kirim" />
          </div>
          <Input label="Catatan (opsional)" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Detail tambahan" />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Pilih Boks TSG</h3>
              <span className="text-sm text-gray-500">{returnSelected.size} boks dipilih</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-gray-500">Filter Supplier:</label>
              <select
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
                value={returnSupplierFilter}
                onChange={(e) => setReturnSupplierFilter(e.target.value)}
              >
                <option value="">Semua Supplier</option>
                {returnOriginSuppliers.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {returnFilteredInventory.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Tidak ada boks AVAILABLE.</p>
              ) : returnFilteredInventory.map((item) => (
                <label key={item.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={returnSelected.has(item.id)}
                    onChange={(e) => {
                      const next = new Set(returnSelected);
                      if (e.target.checked) {
                        next.add(item.id);
                        // Default supplier = asal boks saat receiving
                        if (!returnSupplierId && item.supplierId) setReturnSupplierId(item.supplierId);
                      } else {
                        next.delete(item.id);
                      }
                      setReturnSelected(next);
                    }}
                    className="size-4"
                  />
                  <span className="font-mono text-sm">{item.boxCode}</span>
                  <span className="text-sm text-gray-500">{item.weightKg} kg</span>
                  <span className="text-sm text-gray-400">{item.tsgType}</span>
                  <span className="text-sm text-gray-600 ml-auto">📦 {item.supplierName ?? "-"}</span>
                </label>
              ))}
            </div>
          </div>

          {returnError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{returnError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveReturn} disabled={returnSaving}>
            {returnSaving ? "Menyimpan..." : `Retur · ${returnSelected.size} Boks`}
          </Button>
        </div>
      </Dialog>

      {/* Riwayat Retur TSG */}
      {returnHistory.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Riwayat Retur TSG ke Supplier ({returnHistory.length})</CardTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Supplier</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Boks</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Total Berat</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Alasan</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {returnHistory.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-3 font-mono text-sm">{r.returnCode}</td>
                    <td className="py-3 font-medium">{r.supplierName}</td>
                    <td className="py-3 text-sm">{r.returnedAt ? new Date(r.returnedAt).toLocaleString("id-ID") : "-"}</td>
                    <td className="py-3"><Badge variant="error">{r.totalBoxCount} boks</Badge></td>
                    <td className="py-3 font-bold">{parseFloat(r.totalWeightKg || "0").toFixed(1)} kg</td>
                    <td className="py-3 text-sm text-gray-500 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                    <td className="py-3">
                      <Button size="sm" variant="outline" onClick={() => openDoc(`/api/v1/tsg-returns/${r.id}/document`)}>🖨 Cetak</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Keluar Material & Sparepart Dialog */}
      <Dialog
        open={showMatOut}
        onClose={() => setShowMatOut(false)}
        title="Keluar Material & Sparepart"
        className="max-w-3xl"
      >
        <div className="space-y-4">
          {/* Toggle jenis material */}
          <div className="flex gap-2">
            {(["CONSUMABLE", "SPAREPART"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setMatOutType(t); setMatOutItems([{ itemId: "", qty: "" }]); loadMaterialItems(t); }}
                className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                  matOutType === t ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t === "CONSUMABLE" ? "🧵 Consumable" : "🔧 Sparepart"}
              </button>
            ))}
          </div>

          {/* Toggle alur keluar */}
          <div className="flex gap-2">
            {(["TRANSFER", "RETUR", "PEMAKAIAN", "RUSAK"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setMatOutFlow(f)}
                className={`flex-1 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors ${
                  matOutFlow === f ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {f === "TRANSFER" ? "🚚 Kirim Pabrik Lain" : f === "RETUR" ? "↩️ Retur Supplier" : f === "PEMAKAIAN" ? "🏭 Pemakaian Produksi" : "🗑️ Rusak"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matOutFlow === "PEMAKAIAN" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mesin Tujuan</label>
                <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={matOutMachine} onChange={e => setMatOutMachine(e.target.value)}>
                  <option value="">Pilih Mesin</option>
                  {machines.map((m: any) => <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.type})</option>)}
                </select>
              </div>
            ) : matOutFlow === "RUSAK" ? (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
                Barang rusak di gudang — tanpa mesin maupun tujuan.
              </div>
            ) : (
              <Input
                label={matOutFlow === "TRANSFER" ? "Pabrik Tujuan" : "Nama Supplier"}
                value={matOutCounterpart}
                onChange={e => setMatOutCounterpart(e.target.value)}
                placeholder={matOutFlow === "TRANSFER" ? "cth: Pabrik Pamekasan" : "cth: Supplier Jawa 1"}
              />
            )}
            <Input label="Alasan *" value={matOutReason} onChange={e => setMatOutReason(e.target.value)} placeholder={matOutFlow === "PEMAKAIAN" ? "cth: Pemakaian mesin HLP minggu ini" : matOutFlow === "RUSAK" ? "cth: Karung sobek / bearing pecah saat dibongkar" : "cth: Cacat / transfer stok / salah kirim"} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Daftar Item</h3>
              <span className="text-sm text-gray-500">{matOutItems.length} item</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {matOutItems.map((item, i) => {
                const baseList = matOutType === "CONSUMABLE" ? consumableList : sparepartList;
                // Filter penanda mesin berlaku (MAKER/HLP/BOTH) saat PEMAKAIAN
                const machineType = matOutFlow === "PEMAKAIAN" ? machines.find((m: any) => m.id === matOutMachine)?.type : null;
                const list = machineType
                  ? baseList.filter((c: any) => (c.applicableMachines ?? "BOTH") === "BOTH" || c.applicableMachines === machineType)
                  : baseList;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                    <span className="w-8 text-center font-bold text-gray-400">{i + 1}</span>
                    <select
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-3 text-sm bg-white"
                      value={item.itemId}
                      onChange={e => { const next = [...matOutItems]; next[i] = { ...next[i]!, itemId: e.target.value }; setMatOutItems(next); }}
                    >
                      <option value="">Pilih {matOutType === "CONSUMABLE" ? "Item" : "Sparepart"}</option>
                      {list.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                    </select>
                    <Input
                      type="number"
                      value={item.qty}
                      onChange={e => { const next = [...matOutItems]; next[i] = { ...next[i]!, qty: e.target.value }; setMatOutItems(next); }}
                      placeholder="Qty"
                      className="w-28"
                    />
                    {matOutItems.length > 1 && (
                      <button className="text-red-400 hover:text-red-600" onClick={() => setMatOutItems(matOutItems.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setMatOutItems([...matOutItems, { itemId: "", qty: "" }])}>
              + Tambah Item
            </Button>
          </div>

          {matOutError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{matOutError}</div>}
          <Button size="operator" className="w-full" onClick={handleSaveMaterialOut} disabled={matOutSaving}>
            {matOutSaving ? "Menyimpan..." : `Keluar · ${matOutItems.filter(i => i.itemId && parseFloat(i.qty) > 0).length} Item`}
          </Button>
        </div>
      </Dialog>

      {/* Riwayat Kirim Antar Pabrik */}
      {transferHistory.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Riwayat Kirim TSG Antar Pabrik ({transferHistory.length})</CardTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Kode</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Pabrik Tujuan</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Boks</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Total Berat</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Detail</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {transferHistory.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-3 font-mono text-sm">{t.transferCode}</td>
                    <td className="py-3 font-medium">{t.destinationName}</td>
                    <td className="py-3 text-sm">{t.sentAt ? new Date(t.sentAt).toLocaleString("id-ID") : "-"}</td>
                    <td className="py-3"><Badge variant="info">{t.totalBoxCount} boks</Badge></td>
                    <td className="py-3 font-bold">{parseFloat(t.totalWeightKg || "0").toFixed(1)} kg</td>
                    <td className="py-3 text-sm text-gray-500">
                      {(t.items ?? []).map((it: any) => it.boxCode).join(", ")}
                    </td>
                    <td className="py-3">
                      <Button size="sm" variant="outline" onClick={() => openDoc(`/api/v1/tsg-transfers/${t.id}/document`)}>🖨 Cetak</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {/* Dialog terima batangan external (makloon) */}
      <Dialog open={showExtReceive} onClose={() => setShowExtReceive(false)} title="🏭 Terima Batangan External (Makloon)">
        <div className="space-y-3">
          <Input label="Nama Pengirim *" value={extSender} onChange={(e) => setExtSender(e.target.value)} placeholder="cth: PT Makloon Jaya" />
          <Input label="Nomor PO/DO" value={extDocRef} onChange={(e) => setExtDocRef(e.target.value)} placeholder="cth: PO-009" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage Masuk</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white"
              value={extEntryStage}
              onChange={(e) => setExtEntryStage(e.target.value as any)}
            >
              <option value="BATANGAN">BATANGAN (masuk HLP)</option>
              <option value="PACK">PACK</option>
              <option value="PACK_WRAPPED">PACK TERWRAP (masuk SLOP)</option>
              <option value="SLOP">SLOP</option>
              <option value="BAL">BAL</option>
            </select>
          </div>
          <Input
            label={extEntryStage === "BATANGAN" ? "Berat Batangan (kg) *" : `Jumlah ${extEntryStage === "PACK" || extEntryStage === "PACK_WRAPPED" ? "pack" : extEntryStage.toLowerCase()} *`}
            type="number"
            inputMode="decimal"
            value={extKg}
            onChange={(e) => setExtKg(e.target.value)}
            placeholder="0"
          />
          <Input label="Catatan (opsional)" value={extNotes} onChange={(e) => setExtNotes(e.target.value)} />
          {extError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{extError}</div>}
          <Button size="operator" className="w-full" disabled={extSaving} onClick={handleSubmitExtReceive}>
            {extSaving ? "Menyimpan..." : "SIMPAN (PENDING APPROVAL)"}
          </Button>
        </div>
      </Dialog>

      {/* Dialog tolak batangan external */}
      <Dialog open={rejectExtId != null} onClose={() => setRejectExtId(null)} title="Tolak Penerimaan External">
        <div className="space-y-3">
          <Input label="Catatan Penolakan *" value={rejectExtReason} onChange={(e) => setRejectExtReason(e.target.value)} placeholder="cth: Berat tidak sesuai PO" />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setRejectExtId(null)}>Batal</Button>
            <Button className="flex-1" disabled={rejectExtReason.trim().length < 3} onClick={handleRejectExt}>Tolak</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
