"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Printer } from "lucide-react";

interface InventoryItem {
  id: string;
  boxCode: string;
  weightKg: number;
  tsgType?: string;
  ageInDays: number;
  location: string;
  status: "AVAILABLE" | "ALLOCATED" | "USED" | "WRITTEN_OFF";
}

const MOCK_INVENTORY: InventoryItem[] = [
  { id: "inv_001", boxCode: "TSG-20260808-042", weightKg: 29.70, tsgType: "REGULER", ageInDays: 3, location: "RAK-A-01", status: "AVAILABLE" },
  { id: "inv_002", boxCode: "TSG-20260809-011", weightKg: 30.05, tsgType: "MILD", ageInDays: 2, location: "RAK-A-02", status: "AVAILABLE" },
  { id: "inv_003", boxCode: "TSG-20260810-005", weightKg: 29.85, tsgType: "PUTIHAN", ageInDays: 1, location: "RAK-A-01", status: "AVAILABLE" },
  { id: "inv_004", boxCode: "TSG-20260810-006", weightKg: 30.20, tsgType: "REGULER", ageInDays: 1, location: "RAK-B-03", status: "USED" },
  { id: "inv_005", boxCode: "TSG-20260801-033", weightKg: 29.50, tsgType: "REGULER", ageInDays: 10, location: "RAK-A-01", status: "ALLOCATED" },
];

export default function GudangInboundPage() {
  const [inventory] = useState(MOCK_INVENTORY);
  const [showReceiving, setShowReceiving] = useState(false);
  const [receivingBoxes, setReceivingBoxes] = useState<Array<{ code: string; weight: string }>>([
    { code: "", weight: "" }, { code: "", weight: "" }, { code: "", weight: "" },
  ]);
  const [filterStatus, setFilterStatus] = useState<string>("AVAILABLE");

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
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gudang Inbound</h1>
          <p className="text-lg text-gray-500 mt-1">
            Terima TSG dari supplier · Inventory FIFO
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/labels">
            <Button size="xl" variant="outline">
              <Printer className="size-5 mr-2" /> Cetak Label
            </Button>
          </Link>
          <Button size="xl" onClick={() => { setReceivingBoxes([{ code: "", weight: "" }, { code: "", weight: "" }, { code: "", weight: "" }]); setShowReceiving(true); }}>
            🚛 Terima TSG Baru
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
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
      <div className="flex gap-2 mb-4">
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
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{item.boxCode}</td>
                  <td className="py-3"><Badge variant={item.tsgType === "REGULER" ? "info" : item.tsgType === "MILD" ? "success" : "warning"}>{item.tsgType ?? "REGULER"}</Badge></td>
                  <td className="py-3">{item.weightKg} kg</td>
                  <td className="py-3">{ageBadge(item.ageInDays)}</td>
                  <td className="py-3 text-sm text-gray-500">{item.location}</td>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base">
                <option>SUP-JAWA-01 — Supplier Jawa 1</option>
                <option>SUP-JAWA-02 — Supplier Jawa 2</option>
              </select>
            </div>
            <Input label="No Surat Jalan Supplier" placeholder="Opsional" />
          </div>

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
                  <Input type="number" value={box.weight} onChange={e => { const next = [...receivingBoxes]; next[i] = { ...next[i]!, weight: e.target.value }; setReceivingBoxes(next); }} placeholder="0.00" className="w-32" />
                  {receivingBoxes.length > 1 && (
                    <button className="text-red-400 hover:text-red-600" onClick={() => setReceivingBoxes(receivingBoxes.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setReceivingBoxes([...receivingBoxes, { code: "", weight: "" }])}>
              + Tambah Boks
            </Button>
          </div>

          <Button size="operator" className="w-full" onClick={() => setShowReceiving(false)}>
            Simpan · {receivingBoxes.filter(b => b.code && b.weight).length} Boks
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
