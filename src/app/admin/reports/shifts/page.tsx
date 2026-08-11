"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

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

export default function ShiftReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(lastWeek);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("");
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await apiFetch(`/shifts?${params.toString()}`);
      let data = res.data ?? [];
      // Client-side filter by date
      if (from) data = data.filter((s: any) => s.reportDate >= from);
      if (to) data = data.filter((s: any) => s.reportDate <= to);
      setShifts(data);
    } catch { setShifts([]); }
    finally { setLoading(false); }
  }, [from, to, status]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (shiftId: string) => {
    setDetailLoading(true);
    try {
      const detail = await apiFetch(`/shifts/${shiftId}`);
      setSelected(detail);
    } catch { setSelected(null); }
    finally { setDetailLoading(false); }
  };

  // Expand handled via dialog (openDetail)

  const handlePrint = () => window.print();

  // Summary
  const total = shifts.length;
  const approved = shifts.filter((s) => s.status === "APPROVED").length;
  const completed = shifts.filter((s) => s.status === "COMPLETED").length;
  const running = shifts.filter((s) => s.status === "RUNNING").length;

  const statusBadge = (s: string) => {
    const m: Record<string, "success"|"warning"|"info"|"error"> = {
      RUNNING: "info", COMPLETED: "warning", APPROVED: "success",
    };
    return <Badge variant={m[s] ?? "neutral"}>{s}</Badge>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan Per Shift</h1>
          <p className="text-gray-500">Detail produksi per shift: boks, yield, waste, downtime, tim</p>
        </div>
        <Button onClick={handlePrint} variant="outline">🖨 Print</Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <Input label="Dari Tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 min-w-[150px]" />
          <Input label="Sampai Tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 min-w-[150px]" />
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Semua</option>
              <option value="RUNNING">RUNNING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="APPROVED">APPROVED</option>
            </select>
          </div>
          <Button onClick={load} disabled={loading}>{loading ? "..." : "🔍 Filter"}</Button>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Shift", value: total, color: "text-blue-700" },
          { label: "APPROVED", value: approved, color: "text-green-700" },
          { label: "COMPLETED", value: completed, color: "text-yellow-700" },
          { label: "RUNNING", value: running, color: "text-blue-600" },
        ].map((s) => (
          <Card key={s.label}><p className="text-xs text-gray-500">{s.label}</p><p className={`text-3xl font-bold ${s.color}`}>{s.value}</p></Card>
        ))}
      </div>

      {/* Shifts Table */}
      <Card className="mb-6">
        <CardTitle>Daftar Shift ({shifts.length})</CardTitle>
        {loading ? <p className="py-8 text-center text-gray-400">Memuat...</p> : shifts.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            Belum ada data shift.<br />Jalankan <strong>Skenario 1</strong> (Operator Produksi) dulu.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Shift ID</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Mulai</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Selesai</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Boks</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Yield</th>
                  <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s: any) => (
                  <React.Fragment key={s.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 font-mono text-sm">{s.reportDate}</td>
                      <td className="py-3 font-mono text-xs text-gray-500">{s.id?.slice(0, 10)}</td>
                      <td className="py-3">{statusBadge(s.status)}</td>
                      <td className="py-3 text-sm">{s.actualStart ? new Date(s.actualStart).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td className="py-3 text-sm">{s.actualEnd ? new Date(s.actualEnd).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td className="py-3 text-sm">-</td>
                      <td className="py-3 text-sm">-</td>
                      <td className="py-3">
                        <Button size="sm" variant="outline" onClick={() => openDetail(s.id)}>📋 Detail</Button>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} title="Detail Shift">
        {detailLoading ? <p className="py-8 text-center text-gray-400">Memuat detail...</p> : selected ? (
          <div className="space-y-5">
            {/* Header */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500">Shift ID</span><p className="font-mono text-xs">{selected.id}</p></div>
              <div><span className="text-gray-500">Status</span><p>{statusBadge(selected.status)}</p></div>
              <div><span className="text-gray-500">Tanggal</span><p className="font-bold">{selected.reportDate}</p></div>
              <div><span className="text-gray-500">Mulai</span><p>{selected.actualStart ? new Date(selected.actualStart).toLocaleString("id-ID") : "-"}</p></div>
              <div><span className="text-gray-500">Selesai</span><p>{selected.actualEnd ? new Date(selected.actualEnd).toLocaleString("id-ID") : "-"}</p></div>
              <div><span className="text-gray-500">Yield</span><p className="font-bold text-lg text-green-700">{selected.yieldPct ?? "-"}%</p></div>
            </div>

            {/* Boxes */}
            {selected.boxes?.length > 0 && (
              <div>
                <p className="font-semibold text-sm mb-2">Boks ({selected.boxes.length})</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {selected.boxes.map((b: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm bg-gray-50 rounded px-3 py-2">
                      <span>#{b.boxNumber} {b.boxCode}</span>
                      <span className="text-gray-500">{b.tsgWeightKg} kg → {b.outputWeightKg ?? "-"} kg</span>
                      <Badge variant={b.yieldPct && parseFloat(b.yieldPct) >= 110 && parseFloat(b.yieldPct) <= 114 ? "success" : "error"}>
                        {b.yieldPct ?? "-"}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Waste */}
            {selected.wastes?.length > 0 && (
              <div>
                <p className="font-semibold text-sm mb-2">Waste</p>
                <div className="grid grid-cols-4 gap-2">
                  {selected.wastes.map((w: any) => (
                    <div key={w.category} className="bg-gray-50 rounded p-2 text-center">
                      <p className="text-xs text-gray-500">{w.category.replace("_", " ")}</p>
                      <p className="font-bold">{w.kg} kg</p>
                      <Badge variant={w.settlementStatus === "LUNAS" ? "success" : "warning"}>{w.settlementStatus}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Handoffs */}
            {selected.handoffs?.length > 0 && (
              <div>
                <p className="font-semibold text-sm mb-2">Handoff</p>
                {selected.handoffs.map((h: any) => (
                  <div key={h.id} className="bg-yellow-50 rounded p-3 text-sm">
                    Sisa TSG: {h.sisaTsgKg} kg · Batangan sementara: {h.batanganSementaraKg} kg
                    {h.claimedByShiftId && <Badge variant="success" className="ml-2">Diklaim</Badge>}
                  </div>
                ))}
              </div>
            )}

            {/* Members */}
            {selected.members?.length > 0 && (
              <div>
                <p className="font-semibold text-sm mb-2">Tim Shift ({selected.members.length} orang)</p>
                <div className="flex flex-wrap gap-2">
                  {selected.members.map((m: any) => (
                    <span key={m.id} className="bg-gray-100 rounded-full px-3 py-1 text-sm">
                      👤 {m.userId?.slice(0, 6)}
                      {m.leaveMinutes > 0 && <span className="text-red-500 ml-1">({m.leaveMinutes}m izin)</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selected.notes && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p className="font-semibold">Catatan:</p>
                <p className="text-gray-600">{selected.notes}</p>
              </div>
            )}
            {selected.reviewNotes && (
              <div className="bg-blue-50 rounded p-3 text-sm">
                <p className="font-semibold">Review Supervisor:</p>
                <p className="text-gray-600">{selected.reviewNotes}</p>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={handlePrint}>🖨 Cetak Laporan Shift</Button>
          </div>
        ) : (
          <p className="py-8 text-center text-gray-400">Gagal memuat detail</p>
        )}
      </Dialog>
    </div>
  );
}
