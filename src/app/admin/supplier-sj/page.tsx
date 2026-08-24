"use client";
import { apiFetch, getToken } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Printer, RefreshCw } from "lucide-react";

type PoolOverview = {
  available: number;
  assigned: number;
  voided: number;
  byPrintDate: Array<{ date: string; available: number }>;
};

export default function SupplierSjPage() {
  const [count, setCount] = useState("100");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [generatedInfo, setGeneratedInfo] = useState("");
  const [error, setError] = useState("");

  const [overview, setOverview] = useState<PoolOverview | null>(null);
  const [voidCode, setVoidCode] = useState("");
  const [voidMsg, setVoidMsg] = useState("");

  const loadOverview = useCallback(async () => {
    try {
      const res = await apiFetch("/supplier-sj/pool");
      setOverview(res.data ?? null);
    } catch { setOverview(null); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const handleGenerate = async () => {
    const n = parseInt(count, 10);
    if (!n || n < 1 || n > 500) { setError("Jumlah label harus 1–500."); return; }
    setGenerating(true);
    setError("");
    try {
      const res = await apiFetch("/supplier-sj/pool", { method: "POST", body: JSON.stringify({ count: n }) });
      setGeneratedCodes(res.boxCodes ?? []);
      setGeneratedInfo(`Tersimpan ${res.boxCodes?.length ?? 0} label AVAILABLE · total pool tersisa ${res.available ?? 0}`);
      loadOverview();
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const handleDownloadPdf = async () => {
    if (generatedCodes.length === 0) return;
    setDownloading(true);
    setError("");
    try {
      const token = getToken();
      const res = await fetch("/api/v1/supplier-sj/pool/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ boxCodes: generatedCodes }),
      });
      if (res.status === 401) { window.location.href = "/tablet/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Gagal membuat PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `pool-label-${datePart}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e.message); }
    finally { setDownloading(false); }
  };

  const handleVoid = async () => {
    if (!voidCode.trim()) { setVoidMsg("Isi kode label dulu."); return; }
    if (!confirm(`VOID label ${voidCode.trim()}? Tindakan ini permanen dan tercatat audit.`)) return;
    // Alasan untuk kolom void_reason — compliance (mobile handoff v2.2.3 §5)
    const reason = (prompt("Alasan VOID (untuk audit):") ?? "").trim();
    try {
      await apiFetch(`/supplier-sj/labels/${voidCode.trim()}/void`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      });
      setVoidMsg(`Label ${voidCode.trim()} → VOID ✓${reason ? ` (${reason})` : ""}`);
      setVoidCode("");
      loadOverview();
    } catch (e: any) { setVoidMsg(e.message); }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surat Jalan Supplier</h1>
          <p className="text-lg text-gray-500 mt-1">
            Pool label TSG — cetak di area office, dipakai di gudang supplier
          </p>
        </div>
        <Button size="xl" variant="outline" onClick={loadOverview}>
          <RefreshCw className="size-5 mr-2" /> Refresh Pool
        </Button>
      </div>

      {/* Cetak Pool Label */}
      <Card className="mb-6">
        <CardTitle>
          <Printer className="size-5 inline mr-2" /> Cetak Pool Label (XPrinter 420B · 100×75mm)
        </CardTitle>
        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div className="w-40">
            <Input
              label="Jumlah label"
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="100"
            />
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generate..." : "Generate Kode"}
          </Button>
          <Button variant="primary" onClick={handleDownloadPdf} disabled={downloading || generatedCodes.length === 0}>
            {downloading ? "Membuat PDF..." : `⬇ Download PDF (${generatedCodes.length} label)`}
          </Button>
        </div>

        <p className="text-sm text-gray-500 mt-3">
          Alur: generate kode → download PDF (1 label = 1 halaman) → buka PDF → print ke XPrinter 420B dengan
          paper 100×75mm, scale 100%. PDF bisa disimpan & dicetak ulang selama kode belum terpakai.
        </p>

        {error && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {generatedInfo && <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">{generatedInfo}</div>}

        {generatedCodes.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-600 mb-2">Kode ter-generate ({generatedCodes.length}):</p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
              {generatedCodes.map((c) => (
                <span key={c} className="inline-block font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 mr-1 mb-1">{c}</span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Overview Pool */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "AVAILABLE (siap dipakai)", count: overview?.available ?? 0, color: "text-green-700" },
          { label: "ASSIGNED (terikat SJ)", count: overview?.assigned ?? 0, color: "text-blue-700" },
          { label: "VOID (hilang/rusak)", count: overview?.voided ?? 0, color: "text-red-700" },
          { label: "TOTAL", count: (overview?.available ?? 0) + (overview?.assigned ?? 0) + (overview?.voided ?? 0), color: "text-gray-700" },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardTitle>Sisa Pool per Tanggal Cetak</CardTitle>
        {(overview?.byPrintDate ?? []).length === 0 ? (
          <p className="py-6 text-center text-gray-400">Belum ada label pool. Generate dulu di atas.</p>
        ) : (
          <table className="mt-4 w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Tanggal Cetak</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Sisa AVAILABLE</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.byPrintDate ?? []).map((r) => (
                <tr key={r.date} className="border-b border-gray-100">
                  <td className="py-3 font-mono text-sm">{r.date}</td>
                  <td className="py-3">
                    <Badge variant={r.available === 0 ? "error" : "success"}>{r.available}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* VOID label */}
      <Card>
        <CardTitle>VOID Label (hilang / rusak)</CardTitle>
        <div className="mt-4 flex items-end gap-3 flex-wrap">
          <div className="w-64">
            <Input
              label="Kode label"
              value={voidCode}
              onChange={(e) => setVoidCode(e.target.value)}
              placeholder="TSG-20260815-001"
            />
          </div>
          <Button variant="outline" onClick={handleVoid}>Tandai VOID</Button>
        </div>
        {voidMsg && <p className="mt-3 text-sm text-gray-600">{voidMsg}</p>}
        <p className="text-sm text-gray-500 mt-3">
          Hanya label AVAILABLE yang bisa di-VOID. Label yang sudah terikat SJ tidak bisa dibatalkan dari sini.
        </p>
      </Card>
    </div>
  );
}
