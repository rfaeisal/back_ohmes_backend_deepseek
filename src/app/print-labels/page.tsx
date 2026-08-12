"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

type LabelData = {
  id: string;
  code: string;
  type: string;
  sub1: string;
  sub2: string;
  date: string;
};

// Generate simple QR inline SVG from text
function qrSvg(text: string, size = 72): string {
  // Simple representation using deterministic pattern based on text
  const hash = Array.from(text).reduce((a, c) => a + c.charCodeAt(0), 0);
  const rows = 7;
  const cols = 7;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${cols} ${rows}">`;
  svg += `<rect width="${cols}" height="${rows}" fill="white"/>`;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const val = (hash * (x + 1) * (y + 1) * 7) % 13;
      if (val > 7) {
        svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="black"/>`;
      }
    }
  }
  // Border position markers
  svg += `<rect x="0" y="0" width="2" height="2" fill="black"/><rect x="5" y="0" width="2" height="2" fill="black"/>`;
  svg += `<rect x="0" y="5" width="2" height="2" fill="black"/>`;
  svg += `</svg>`;
  return svg;
}

export default function PrintLabelsPage() {
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem("printLabels");
    if (raw) {
      try { setLabels(JSON.parse(raw)); } catch { }
    }
    setLoading(false);
    // Auto-trigger print after load
    setTimeout(() => window.print(), 800);
  }, []);

  if (loading) return <div className="p-8 text-center">Menyiapkan label...</div>;
  if (labels.length === 0) return <div className="p-8 text-center text-gray-500">Tidak ada label. Pilih item dulu di halaman Cetak Label.</div>;

  return (
    <div className="print-area">
      <style>{`
        @page {
          size: 100mm 60mm landscape;
          margin: 3mm;
        }
        @media print {
          body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .label-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; padding: 2mm; }
          .label-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @page { margin: 3mm; }
        }
        @media screen {
          .label-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 12px;
            padding: 20px;
          }
        }
        .label-card {
          border: 2px dashed #999;
          border-radius: 4px;
          background: white;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          min-height: 90px;
        }
        @media print {
          .label-card { border: 1px solid #ccc; border-radius: 2px; padding: 3mm 4mm; min-height: 22mm; }
        }
        .label-qr { flex-shrink: 0; }
        .label-info { flex: 1; min-width: 0; }
        .label-code { font-weight: 700; font-size: 13px; font-family: 'Courier New', monospace; }
        .label-sub { font-size: 10px; color: #555; margin-top: 2px; }
        .label-date { font-size: 8px; color: #999; margin-top: 3px; }
        .label-type {
          display: inline-block; font-size: 7px; font-weight: 700;
          padding: 1px 5px; border-radius: 2px; margin-top: 2px;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .label-type.tsg { background: #e3f2fd; color: #1565c0; }
        .label-type.machine { background: #e8f5e9; color: #2e7d32; }
        .label-type.batch { background: #fff3e0; color: #e65100; }

        .toolbar {
          display: flex; gap: 8px; padding: 12px 20px;
          background: #f5f5f5; border-bottom: 1px solid #ddd;
          align-items: center;
          position: sticky; top: 0; z-index: 10;
        }
        @media print { .toolbar { display: none !important; } }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar no-print">
        <Button size="sm" variant="primary" onClick={() => window.print()}>
          Print ({labels.length} label)
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.close()}>
          Tutup
        </Button>
        <span className="text-sm text-gray-500 ml-2">
          Ukuran label: 100×60mm | Printer: Thermal Transfer | Material: BOPP waterproof
        </span>
      </div>

      {/* Labels Grid */}
      <div className="label-grid">
        {labels.map((label, i) => (
          <div key={i} className="label-card">
            <div className="label-qr" dangerouslySetInnerHTML={{ __html: qrSvg(label.code, 68) }} />
            <div className="label-info">
              <div className="label-code">{label.code}</div>
              <div className="label-sub">{label.sub1}</div>
              <div className="label-sub">{label.sub2}</div>
              <span className={`label-type ${label.type.toLowerCase()}`}>{label.type.replace("_", " ")}</span>
              <div className="label-date">{label.date}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Waterproof note — only on screen */}
      <div className="no-print" style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 12 }}>
        🖨 Gunakan printer <strong>Zebra ZT230</strong> atau <strong>TSC TE310</strong> dengan label <strong>Polypropylene (BOPP) 100×60mm</strong> dan ribbon <strong>Wax/Resin</strong>.
        Label waterproof, tahan minyak, dan tahan suhu gudang.
      </div>
    </div>
  );
}
