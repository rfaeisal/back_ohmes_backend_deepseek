"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Mock data — nanti di-fetch dari API
const MOCK_MACHINES = [
  { id: "mkr01", code: "MKR-01", name: "Maker 1", type: "MAKER", status: "IDLE", lastShiftEnd: "05:30" },
  { id: "mkr02", code: "MKR-02", name: "Maker 2", type: "MAKER", status: "RUNNING", lastShiftEnd: null },
  { id: "hlp01", code: "HLP-01", name: "HLP 1", type: "HLP", status: "IDLE", lastShiftEnd: "05:25" },
];

export default function TabletHome() {
  const [machines] = useState(MOCK_MACHINES);

  return (
    <div>
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Lantai Produksi</h1>
        <p className="mt-1 text-lg text-gray-500">
          Pilih mesin untuk mulai atau lanjutkan shift
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Shift Aktif</p>
            <p className="text-3xl font-bold text-primary-600">1</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Menunggu Approval</p>
            <p className="text-3xl font-bold text-yellow-600">2</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500">Inventory TSG</p>
            <p className="text-3xl font-bold text-blue-600">48</p>
            <p className="text-xs text-gray-400">boks AVAILABLE</p>
          </div>
        </Card>
      </div>

      {/* Machin List */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Mesin</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {machines.map((machine) => (
          <Card
            key={machine.id}
            highlight={machine.status === "RUNNING" ? "green" : "none"}
            className="hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <CardTitle>{machine.code}</CardTitle>
                <CardSubtitle>{machine.name} · {machine.type}</CardSubtitle>
              </div>
              <Badge
                variant={machine.status === "RUNNING" ? "success" : "neutral"}
              >
                {machine.status === "RUNNING" ? "AKTIF" : "IDLE"}
              </Badge>
            </div>
            {machine.status === "RUNNING" ? (
              <Link href={`/tablet/shift/active-${machine.id}`}>
                <Button size="lg" variant="primary" className="w-full">
                  Lanjutkan Shift →
                </Button>
              </Link>
            ) : (
              <Link href={`/tablet/start-shift?machine=${machine.id}`}>
                <Button size="lg" variant="outline" className="w-full">
                  Mulai Shift Baru
                </Button>
              </Link>
            )}
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/tablet/gudang">
          <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <span className="text-3xl">🚛</span>
              <div>
                <CardTitle>Gudang Inbound</CardTitle>
                <CardSubtitle>Terima TSG dari supplier · Inventory FIFO</CardSubtitle>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/tablet/dashboard">
          <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <span className="text-3xl">📊</span>
              <div>
                <CardTitle>Dashboard</CardTitle>
                <CardSubtitle>KPI harian · Yield · Waste · Downtime</CardSubtitle>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
