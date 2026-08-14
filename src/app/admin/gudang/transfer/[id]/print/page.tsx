"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function formatTanggalId(d: Date): string {
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export default function TransferPrintPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API}/tsg-transfers/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) setData(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  // Auto-print setelah data siap
  useEffect(() => {
    if (!loading && data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, data]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat dokumen...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">Transfer tidak ditemukan.</div>;

  const sentAt = new Date(data.sentAt);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Tombol cetak — tidak ikut tercetak */}
      <div className="no-print mb-4 flex gap-3 justify-end">
        <Button variant="outline" onClick={() => window.print()}>🖨 Cetak Dokumen</Button>
        <Button variant="outline" onClick={() => window.history.back()}>← Kembali</Button>
      </div>

      {/* Dokumen formal */}
      <div className="bg-white border border-gray-300 rounded p-10 document-print">
        {/* Kop */}
        <div className="text-center border-b-4 border-double border-gray-800 pb-4 mb-6">
          <h1 className="text-xl font-bold tracking-wide">BERITA ACARA SERAH TERIMA BARANG</h1>
          <p className="text-sm mt-1 font-mono">Nomor: {data.transferCode}</p>
        </div>

        <p className="text-sm leading-relaxed mb-6">
          Pada hari ini, <strong>{formatTanggalId(sentAt)}</strong>, yang bertanda tangan di bawah ini:
        </p>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="border border-gray-400 rounded p-4">
            <p className="font-bold mb-2">1. Yang Menyerahkan</p>
            <table className="w-full">
              <tbody>
                <tr><td className="py-1 pr-2 w-24 align-top">Nama</td><td className="py-1">: {data.senderName || "..................."}</td></tr>
                <tr><td className="py-1 pr-2 w-24 align-top">Jabatan</td><td className="py-1">: Staf Gudang</td></tr>
                <tr><td className="py-1 pr-2 w-24 align-top">Pabrik</td><td className="py-1">: {data.plantName} ({data.plantCode})</td></tr>
              </tbody>
            </table>
          </div>
          <div className="border border-gray-400 rounded p-4">
            <p className="font-bold mb-2">2. Yang Menerima</p>
            <table className="w-full">
              <tbody>
                <tr><td className="py-1 pr-2 w-24 align-top">Nama</td><td className="py-1">: ........................................</td></tr>
                <tr><td className="py-1 pr-2 w-24 align-top">Jabatan</td><td className="py-1">: ........................................</td></tr>
                <tr><td className="py-1 pr-2 w-24 align-top">Pabrik</td><td className="py-1">: {data.destinationName}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-sm mb-3">
          Telah dilakukan serah terima barang berupa <strong>Tembakau Shag Giling (TSG)</strong> dengan rincian sebagai berikut:
        </p>

        {/* Tabel rincian */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr>
              <th className="border border-gray-700 px-3 py-2 text-center">No</th>
              <th className="border border-gray-700 px-3 py-2 text-left">Kode Boks</th>
              <th className="border border-gray-700 px-3 py-2 text-left">Jenis TSG</th>
              <th className="border border-gray-700 px-3 py-2 text-right">Berat (kg)</th>
            </tr>
          </thead>
          <tbody>
            {(data.items ?? []).map((it: any, i: number) => (
              <tr key={it.id}>
                <td className="border border-gray-700 px-3 py-2 text-center">{i + 1}</td>
                <td className="border border-gray-700 px-3 py-2 font-mono">{it.boxCode}</td>
                <td className="border border-gray-700 px-3 py-2">{it.tsgType ?? "-"}</td>
                <td className="border border-gray-700 px-3 py-2 text-right">{Number(it.weightKg).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-100">
              <td className="border border-gray-700 px-3 py-2 text-center" colSpan={2}>TOTAL</td>
              <td className="border border-gray-700 px-3 py-2">{data.totalBoxCount} boks</td>
              <td className="border border-gray-700 px-3 py-2 text-right">{Number(data.totalWeightKg).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {data.notes && (
          <p className="text-sm mb-6"><strong>Catatan:</strong> {data.notes}</p>
        )}

        <p className="text-sm mb-10 leading-relaxed">
          Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
        </p>

        {/* Tanda tangan */}
        <div className="grid grid-cols-2 gap-10 text-sm text-center">
          <div>
            <p className="mb-16">Yang Menyerahkan,</p>
            <p className="font-bold underline">{data.senderName || "..................."}</p>
          </div>
          <div>
            <p className="mb-16">Yang Menerima,</p>
            <p className="font-bold underline">........................................</p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .document-print { border: none !important; padding: 0 !important; }
          @page { size: A4; margin: 16mm; }
        }
      `}</style>
    </div>
  );
}
