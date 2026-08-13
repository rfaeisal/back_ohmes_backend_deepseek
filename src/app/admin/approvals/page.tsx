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
  if (res.status === 401) {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    window.location.href = "/tablet/login";
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }
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
    } catch (e: any) {
      setShifts([]);
      if (!e.message?.includes("Sesi berakhir")) alert(e.message);
    } finally { setLoading(false); }
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
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Shift ID:</span> <span className="font-mono">{selected.id?.slice(0,16)}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant="warning">{selected.status}</Badge></div>
              <div><span className="text-gray-500">Tanggal:</span> {selected.reportDate}</div>
              <div><span className="text-gray-500">Shift:</span> {selected.shiftTemplateName || "-"}</div>
              <div><span className="text-gray-500">Mesin:</span> {selected.machineCode || "-"}</div>
              <div><span className="text-gray-500">Produk:</span> {selected.productName || "-"}</div>
              <div><span className="text-gray-500">Mulai:</span> {selected.actualStart ? new Date(selected.actualStart).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</div>
              <div><span className="text-gray-500">Selesai:</span> {selected.actualEnd ? new Date(selected.actualEnd).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</div>
            </div>

            {/* Tim */}
            {selected.members?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Tim Shift ({selected.members.length} orang)</p>
                <div className="flex flex-wrap gap-2">
                  {selected.members.map((m: any) => (
                    <span key={m.id} className="bg-gray-100 rounded-full px-3 py-1 text-sm">
                      👤 {m.userName || m.userId?.slice(0, 8)}
                      {m.roleName && <span className="text-gray-400 ml-1">· {m.roleName}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Boks TSG */}
            {selected.boxes?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Boks TSG ({selected.boxes.length})</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-600">#</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-600">Kode Boks</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">TSG (kg)</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Berat Batangan (kg)</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Yield</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.boxes.map((b: any) => (
                        <tr key={b.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2">{b.boxNumber}</td>
                          <td className="px-3 py-2 font-mono">{b.boxCode || "-"}</td>
                          <td className="px-3 py-2 text-right">{b.tsgWeightKg}</td>
                          <td className="px-3 py-2 text-right">{b.outputWeightKg ?? "-"}</td>
                          <td className="px-3 py-2 text-right">
                            {b.yieldPct != null ? (
                              <Badge variant={Number(b.yieldPct) >= 110 && Number(b.yieldPct) <= 114 ? "success" : "error"}>{b.yieldPct}%</Badge>
                            ) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-3 py-2" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right">{selected.boxes.reduce((s: number, b: any) => s + Number(b.tsgWeightKg || 0), 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{selected.boxes.reduce((s: number, b: any) => s + Number(b.outputWeightKg || 0), 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          <strong>{selected.yieldPct != null ? `${selected.yieldPct}%` : "-"}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Waste */}
            {selected.wastes?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Waste</p>
                <div className="grid grid-cols-4 gap-2">
                  {selected.wastes.map((w: any) => (
                    <div key={w.category} className="rounded bg-gray-50 p-2 text-center">
                      <p className="text-xs text-gray-500">{w.category.replace("_", " ")}</p>
                      <p className="font-bold">{w.kg} kg</p>
                      <p className="text-xs text-gray-400">{w.settlementStatus}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Total waste: <strong>{selected.wastes.reduce((s: number, w: any) => s + Number(w.kg || 0), 0).toFixed(2)} kg</strong>
                </p>
              </div>
            )}

            {/* Consumptions */}
            {selected.consumptions?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Pemakaian Bahan per Boks ({selected.consumptions.length})</p>
                <div className="space-y-1">
                  {selected.consumptions.map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm bg-gray-50 rounded p-2">
                      <span>{c.itemName || "-"}</span>
                      <span className="text-gray-500">{c.quantity}{c.note ? ` · ${c.note}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shift-level Consumptions */}
            {selected.shiftConsumptions?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">📦 Pemakaian Material Akhir Shift ({selected.shiftConsumptions.length})</p>
                <div className="space-y-1">
                  {selected.shiftConsumptions.map((c: any) => (
                    <div key={c.id} className="flex justify-between text-sm bg-orange-50 rounded p-2">
                      <span>{c.itemName || "-"}</span>
                      <span className="text-gray-500">{c.quantity}{c.note ? ` · ${c.note}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Downtimes */}
            {selected.downtimes?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Downtime ({selected.downtimes.length})</p>
                <div className="space-y-1">
                  {selected.downtimes.map((d: any) => (
                    <div key={d.id} className="flex justify-between text-sm bg-yellow-50 rounded p-2">
                      <span className="font-medium">{d.category?.replace(/_/g, " ")}</span>
                      <span className="text-gray-500">{d.durationMinutes} menit{d.description ? ` · ${d.description}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Maintenances */}
            {selected.maintenances?.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Maintenance ({selected.maintenances.length})</p>
                <div className="space-y-1">
                  {selected.maintenances.map((m: any) => (
                    <div key={m.id} className="flex justify-between text-sm bg-blue-50 rounded p-2">
                      <span>{m.itemName || "-"}</span>
                      <span className="text-gray-500">{m.quantity} unit{m.note ? ` · ${m.note}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
