"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

export default function CorrectionsPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [showCorrect, setShowCorrect] = useState(false);
  const [fieldPath, setFieldPath] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [fieldReason, setFieldReason] = useState("");
  const [corrections, setCorrections] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/shifts?status=APPROVED&limit=20");
      setShifts(res.data ?? []);
    } catch { setShifts([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCorrections = async (shiftId: string) => {
    try {
      const [detail, corr] = await Promise.all([
        apiFetch(`/shifts/${shiftId}`),
        apiFetch(`/shifts/${shiftId}/corrections`),
      ]);
      setSelected(detail);
      setCorrections(corr?.corrections ?? []);
    } catch (e: any) { alert(e.message); }
  };

  const handleCorrect = async () => {
    if (!selected) return;
    try {
      await apiFetch(`/shifts/${selected.id}/correct`, {
        method: "POST",
        body: JSON.stringify({
          correctionFields: [{ path: fieldPath, newValue: fieldValue, reason: fieldReason }],
        }),
      });
      alert("✅ Correction created — shift asli tetap intact");
      setShowCorrect(false);
      setFieldPath(""); setFieldValue(""); setFieldReason("");
      openCorrections(selected.id);
    } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat shift APPROVED...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">CORRECTION Flow</h1>
      <p className="text-gray-500 mb-6">HQ Auditor — Koreksi shift LOCKED (tidak mengubah data asli)</p>

      <Card className="mb-6">
        <CardTitle>Shift APPROVED / LOCKED ({shifts.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Shift ID</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Approved</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Tidak ada shift LOCKED</td></tr>
              ) : shifts.map((s: any) => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">{s.id?.slice(0, 12)}</td>
                  <td className="py-3">{s.reportDate}</td>
                  <td className="py-3"><Badge variant="success">🔒 {s.status}</Badge></td>
                  <td className="py-3 text-sm text-gray-500">{s.approvedAt ? new Date(s.approvedAt).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="py-3"><Button size="sm" onClick={() => openCorrections(s.id)}>Lihat & Koreksi</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail + Corrections Dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} title="Detail Shift LOCKED">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Shift ID:</span> <span className="font-mono">{selected.id?.slice(0, 16)}</span></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant="success">🔒 LOCKED</Badge></div>
              <div><span className="text-gray-500">Tanggal:</span> {selected.reportDate}</div>
              <div><span className="text-gray-500">Yield:</span> {selected.yieldPct}%</div>
            </div>

            {/* Existing Corrections */}
            {corrections.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Riwayat Koreksi ({corrections.length}):</p>
                {corrections.map((c: any) => (
                  <div key={c.id} className="rounded bg-yellow-50 border border-yellow-200 p-3 mb-2 text-sm">
                    <p className="font-mono text-xs text-gray-500">{c.id?.slice(0, 12)} — {new Date(c.createdAt).toLocaleString("id-ID")}</p>
                    <p className="mt-1">{JSON.stringify(c.correctionFields)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* New Correction */}
            {showCorrect ? (
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 space-y-3">
                <p className="font-bold text-red-700">Buat Koreksi Baru</p>
                <Input label="Field Path" value={fieldPath} onChange={e => setFieldPath(e.target.value)} placeholder="waste.MENIR.kg" />
                <Input label="Nilai Baru" value={fieldValue} onChange={e => setFieldValue(e.target.value)} />
                <Input label="Alasan (wajib)" value={fieldReason} onChange={e => setFieldReason(e.target.value)} placeholder="Salah timbang..." />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowCorrect(false)}>Batal</Button>
                  <Button size="sm" variant="danger" disabled={!fieldPath.trim() || !fieldReason.trim()} onClick={handleCorrect}>Simpan Koreksi</Button>
                </div>
              </div>
            ) : (
              <Button size="lg" variant="danger" className="w-full" onClick={() => setShowCorrect(true)}>
                ✏️ Buat Koreksi (CORRECTION)
              </Button>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
