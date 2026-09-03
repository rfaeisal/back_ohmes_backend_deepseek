// =============================================================================
// Batangan Out PDF — Berita Acara Serah Terima Batangan (docs/26 §6)
// =============================================================================
// PDF formal dua tanda tangan — pabrik menyerahkan batangan (produk final #1)
// ke tujuan internal / customer makloon. Layout mengikuti
// rijekan-return-pdf.service.ts.
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalId } from "./berita-acara-pdf.service";

export interface BatanganOutPdfInput {
  nomor: string; // docRef atau BTO-<id>
  tanggal: Date;
  batchCode: string | null;
  qtyKg: number;
  batangEst: number | null;
  destinationType: string;
  destinationName: string;
  orderCode: string | null;
  productName: string | null;
  outByName: string;
  plantLabel: string;
}

export async function buildBatanganOutPdf(input: BatanganOutPdfInput): Promise<Uint8Array> {
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

  center("BERITA ACARA SERAH TERIMA BATANGAN", y, 15, bold);
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
    ["Nama", input.outByName || "..................."],
    ["Jabatan", "Staf Gudang"],
    ["Pabrik", input.plantLabel],
  ]);
  drawBlok(M + blokW + 16, "2. Penerima", [
    ["Tujuan", input.destinationName],
    ["Jenis", input.destinationType === "MAKLOON" ? "Makloon" : input.destinationType === "INTERNAL" ? "Internal" : "Lainnya"],
    ["Order", input.orderCode ?? "................................"],
  ]);
  y -= blokH + 22;

  page.drawText(
    "Telah diserahkan batangan dengan rincian sebagai berikut:",
    { x: M, y, size: 10, font: regular }
  );
  y -= 20;

  const rows: Array<[string, string]> = [
    ["Kode Batch", input.batchCode ?? "-"],
    ["Berat Batangan", `${input.qtyKg} kg`],
    ...(input.batangEst != null ? [["Estimasi Jumlah Batang", `${input.batangEst} batang`] as [string, string]] : []),
    ...(input.productName ? [["Produk Pesanan", input.productName] as [string, string]] : []),
  ];
  const rowH = 22;
  const tableTop = y;
  const tableBottom = y - rows.length * rowH;
  page.drawRectangle({ x: M, y: tableBottom, width: W - 2 * M, height: tableTop - tableBottom, borderColor: ink, borderWidth: 1 });
  let ry = y - 16;
  rows.forEach(([k, v], i) => {
    page.drawText(k, { x: M + 10, y: ry, size: 10, font: regular, color: gray });
    page.drawText(v, { x: M + 220, y: ry, size: 10, font: bold });
    if (i < rows.length - 1) {
      page.drawLine({ start: { x: M, y: ry - 6 }, end: { x: W - M, y: ry - 6 }, thickness: 0.5, color: gray });
    }
    ry -= rowH;
  });

  y = tableBottom - 24;
  page.drawText(
    "Berat di atas tercatat dari timbangan pabrik — angka estimasi batang bersifat perkiraan.",
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
    { label: "Yang Menyerahkan,", name: input.outByName || "..................." },
    { label: "Penerima,", name: "........................................" },
  ];
  sigs.forEach((s, i) => {
    const x = M + i * ((W - 2 * M) / 2);
    page.drawText(s.label, { x, y, size: 10, font: regular, color: gray });
    page.drawLine({ start: { x, y: y - 58 }, end: { x: x + sigW, y: y - 58 }, thickness: 1, color: ink });
    page.drawText(s.name, { x, y: y - 70, size: 9, font: bold });
  });

  return pdf.save();
}
