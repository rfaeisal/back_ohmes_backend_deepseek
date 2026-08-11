"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function ApprovalsPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/shifts?status=COMPLETED&limit=20");
      setShifts(res.data ?? []);
    } catch { setShifts([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (shiftId: string) => {
    try {
      await apiFetch(`/shifts/${shiftId}/approve`, { method: "POST", body: JSON.stringify({ reviewNotes: notes }) });
      alert("✅ Shift APPROVED — LOCKED immutable");
      setSelected(null); setNotes(""); load();
    } catch (e: any) { alert(e.message); }
  };

  const handleReopen = async (shiftId: string) => {
    try {
      await apiFetch(`/shifts/${shiftId}/reopen`, { method: "POST", body: JSON.stringify({ reason: notes || "Reopen for correction" }) });
      alert("✅ Shift REOPENED — status RUNNING");
      setSelected(null); setNotes(""); load();
    } catch (e: any) { alert(e.message); }
  };

  const openDetail = async (shiftId: string) => {
    try {
      const res = await apiFetch(`/shifts/${shiftId}`);
      setSelected(res);
    } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat shift...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Approval Shift</h1>
      <p className="text-gray-500 mb-6">Supervisor Pabrik — Approve shift COMPLETED</p>

      <Card>
        <CardTitle>Shift Menunggu Approval ({shifts.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Shift ID</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Selesai</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Tidak ada shift menunggu approval 🎉</td></tr>
              ) : shifts.map((s: any) => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{s.id?.slice(0, 12)}</td>
                  <td className="py-3">{s.reportDate}</td>
                  <td className="py-3"><Badge variant="warning">{s.status}</Badge></td>
                  <td className="py-3 text-sm text-gray-500">{s.actualEnd ? new Date(s.actualEnd).toLocaleTimeString("id-ID") : "-"}</td>
                  <td className="py-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openDetail(s.id)}>Review</Button>
                    <Button size="sm" variant="primary" onClick={() => handleApprove(s.id)}>Approve</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} title={`Detail Shift`}>
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Shift ID:</span> <span className="font-mono">{selected.id?.slice(0,16)}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant="warning">{selected.status}</Badge></div>
              <div><span className="text-gray-500">Tanggal:</span> {selected.reportDate}</div>
              <div><span className="text-gray-500">Yield:</span> <strong>{selected.yieldPct}%</strong></div>
            </div>
            {selected.wastes && (
              <div>
                <p className="text-sm font-semibold mb-2">Waste:</p>
                <div className="grid grid-cols-4 gap-2">
                  {selected.wastes.map((w: any) => (
                    <div key={w.category} className="rounded bg-gray-50 p-2 text-center">
                      <p className="text-xs text-gray-500">{w.category}</p>
                      <p className="font-bold">{w.kg} kg</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selected.boxes && <p className="text-sm text-gray-500">{selected.boxes.length} boks</p>}
            <Input label="Review Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Masukan review..." />
            <div className="flex gap-3">
              <Button size="lg" variant="outline" className="flex-1" onClick={() => handleReopen(selected.id)}>Reopen (koreksi)</Button>
              <Button size="lg" variant="primary" className="flex-1" onClick={() => handleApprove(selected.id)}>✅ Approve → LOCKED</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
