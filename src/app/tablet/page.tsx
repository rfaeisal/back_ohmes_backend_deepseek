"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401) { localStorage.removeItem("accessToken"); window.location.href = "/tablet/login"; return { data: [] }; }
  if (!res.ok) return { data: [] };
  return res.json();
}

export default function TabletHome() {
  const [machines, setMachines] = useState<any[]>([]);
  const [activeShifts, setActiveShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, sRes] = await Promise.allSettled([
        apiFetch("/machines"),
        apiFetch("/shifts?status=RUNNING&limit=50"),
      ]);
      if (mRes.status === "fulfilled") setMachines(mRes.value.data ?? []);
      if (sRes.status === "fulfilled") setActiveShifts(sRes.value.data ?? []);
    } catch { setMachines([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        {loading ? <p className="col-span-3 text-center text-gray-400 py-8">Memuat data mesin...</p> :
          machines.length === 0 ? <p className="col-span-3 text-center text-gray-400 py-8">Belum ada mesin. Setup di Admin → Master Data.</p> :
          machines.map((m: any) => {
            const activeShift = activeShifts.find((s: any) => s.machineId === m.id);
            const isRunning = !!activeShift;
            return (
          <Card
            key={m.id}
            highlight={isRunning ? "green" : "none"}
            className="hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <CardTitle>{m.code}</CardTitle>
                <CardSubtitle>{m.name} · {m.type}</CardSubtitle>
              </div>
              <Badge variant={isRunning ? "success" : "neutral"}>
                {isRunning ? "AKTIF" : "IDLE"}
              </Badge>
            </div>
            {isRunning ? (
              <Link href={`/tablet/shift/${activeShift.id}`}>
                <Button size="lg" variant="primary" className="w-full">
                  Lanjutkan Shift →
                </Button>
              </Link>
            ) : (
              <Link href={`/tablet/start-shift?machine=${m.id}`}>
                <Button size="lg" variant="outline" className="w-full">
                  Mulai Shift Baru
                </Button>
              </Link>
            )}
          </Card>
        )})}
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
        <Link href="/admin">
          <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <span className="text-3xl">⚙️</span>
              <div>
                <CardTitle>Admin Dashboard</CardTitle>
                <CardSubtitle>Master data · Approval · Audit · Reports</CardSubtitle>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
