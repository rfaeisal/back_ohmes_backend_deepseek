// =============================================================================
// Rijekan Return PDF — Berita Acara Serah Terima Waste Makloon (docs/26 §5)
// =============================================================================
// PDF formal dua tanda tangan — pabrik menyerahkan waste/rijek milik
// customer (per order makloon) kembali ke customer. Pola layout mengikuti
// makloon-serah-terima-pdf.service.ts.
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalId } from "./berita-acara-pdf.service";

export interface RijekanReturnPdfInput {
  nomor: string; // docRef
  tanggal: Date;
  customerName: string;
  orderCode: string | null;
  productName: string | null;
  items: Array<{ unit: string; qty: number }>;
  returnerName: string;
  plantLabel: string;
}

const UNIT_LABEL: Record<string, string> = {
  KG: "kg (waste MAKER / menir)",
  BATANG: "batang (reject HLP)",
  PACK: "pack (reject stage WR)",
  SLOP: "slop (reject stage SLOP)",
  BAL: "bal (reject stage BAL)",
};

export async function buildRijekanReturnPdf(input: RijekanReturnPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  const W = page.getWidth();
  const M = 48;
  const ink = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const center = (text: string, y: number, size: number, font: typeof bold) =>
    page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: ink });

  let y = 841.89 - 44;

  center("BERITA ACARA SERAH TERIMA WASTE MAKLOON", y, 15, bold);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2, color: ink });
  y -= 5;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: ink });
  y -= 20;
  center(`Nomor: ${input.nomor}`, y, 10, bold);
  y -= 30;

  page.drawText(
    `Pada hari ini, ${formatTanggalId(input.tanggal)}, yang bertanda tangan di bawah ini:`,
    { x: M, y, size: 10, font: regular }
  );
  y -= 24;

  const blokH = 62;
  const blokW = (W - 2 * M - 16) / 2;
  const drawBlok = (x: number, label: string, rows: Array<[string, string]>) => {
    page.drawRectangle({ x, y: y - blokH, width: blokW, height: blokH, borderColor: ink, borderWidth: 1 });
    page.drawText(label, { x: x + 8, y: y - 14, size: 10, font: bold });
    rows.forEach(([k, v], i) => {
      page.drawText(`${k}`, { x: x + 8, y: y - 28 - i * 14, size: 9, font: regular, color: gray });
      page.drawText(`: ${v}`, { x: x + 70, y: y - 28 - i * 14, size: 9, font: regular });
    });
  };
  drawBlok(M, "1. Yang Menyerahkan", [
    ["Nama", input.returnerName || "..................."],
    ["Jabatan", "Staf Gudang"],
    ["Pabrik", input.plantLabel],
  ]);
  drawBlok(M + blokW + 16, "2. Customer", [
    ["Nama", input.customerName],
    ["Order", input.orderCode ?? "............................"],
    ["Produk", input.productName ?? "............................"],
  ]);
  y -= blokH + 22;

  page.drawText(
    "Telah diserahkan waste/rijekan makloon milik customer dengan rincian sebagai berikut:",
    { x: M, y, size: 10, font: regular }
  );
  y -= 20;

  const rows: Array<[string, string]> = input.items.map((i) => [
    UNIT_LABEL[i.unit] ?? i.unit,
    `${i.qty} ${i.unit}`,
  ]);
  const rowH = 22;
  const tableTop = y;
  const tableBottom = y - rows.length * rowH;
  page.drawRectangle({ x: M, y: tableBottom, width: W - 2 * M, height: tableTop - tableBottom, borderColor: ink, borderWidth: 1 });
  let ry = y - 16;
  rows.forEach(([k, v], i) => {
    page.drawText(k, { x: M + 10, y: ry, size: 10, font: regular, color: gray });
    page.drawText(v, { x: M + 280, y: ry, size: 10, font: bold });
    if (i < rows.length - 1) {
      page.drawLine({ start: { x: M, y: ry - 6 }, end: { x: W - M, y: ry - 6 }, thickness: 0.5, color: gray });
    }
    ry -= rowH;
  });

  y = tableBottom - 24;
  page.drawText(
    "Waste/rijekan di atas diserahkan sebagaimana catatan rijekan pada sistem — berat/angka asli tercatat sebagai acuan.",
    { x: M, y, size: 9, font: regular, color: gray }
  );
  y -= 20;
  page.drawText(
    "Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.",
    { x: M, y, size: 10, font: regular }
  );

  y -= 90;
  const sigW = 160;
  const sigs = [
    { label: "Yang Menyerahkan,", name: input.returnerName || "..................." },
    { label: "Customer,", name: "........................................" },
  ];
  sigs.forEach((s, i) => {
    const x = M + i * ((W - 2 * M) / 2);
    page.drawText(s.label, { x, y, size: 10, font: regular, color: gray });
    page.drawLine({ start: { x, y: y - 58 }, end: { x: x + sigW, y: y - 58 }, thickness: 1, color: ink });
    page.drawText(s.name, { x, y: y - 70, size: 9, font: bold });
  });

  return pdf.save();
}
