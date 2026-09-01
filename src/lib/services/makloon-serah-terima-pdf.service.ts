// =============================================================================
// Makloon Serah Terima PDF — dokumen pengembalian pack + rijekan ke customer
// =============================================================================
// docs/24 §3.3: PDF formal dua tanda tangan — pabrik menyerahkan pack hasil
// packing (dan rijekan milik customer) kembali ke customer.
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalId } from "./berita-acara-pdf.service";

export interface MakloonSerahTerimaInput {
  nomor: string; // docRef atau ID pack-out
  tanggal: Date;
  batchCode: string;
  batanganKg: number;
  entryStage: string; // stage masuk order (docs/25 §4)
  exitStage: string; // stage saat dikembalikan
  customerName: string;
  docRef: string | null;
  packQty: number;
  rejectPackQty: number;
  rejectBatangQty: number;
  returnerName: string;
  plantLabel: string;
  /** Estimasi berat total pack (kg) — berat/batang × isi × jumlah pack; null kalau tidak ada packing */
  estimatedWeightKg?: number | null;
}

export async function buildMakloonSerahTerimaPdf(input: MakloonSerahTerimaInput): Promise<Uint8Array> {
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

  center("BERITA ACARA SERAH TERIMA PACK MAKLOON", y, 15, bold);
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

  const blokH = 76;
  const blokW = (W - 2 * M - 16) / 2;
  const drawBlok = (x: number, label: string, rows: Array<[string, string]>) => {
    page.drawRectangle({ x, y: y - blokH, width: blokW, height: blokH, borderColor: ink, borderWidth: 1 });
    page.drawText(label, { x: x + 8, y: y - 14, size: 10, font: bold });
    rows.forEach(([k, v], i) => {
      page.drawText(`${k}`, { x: x + 8, y: y - 30 - i * 15, size: 9, font: regular, color: gray });
      page.drawText(`: ${v}`, { x: x + 70, y: y - 30 - i * 15, size: 9, font: regular });
    });
  };
  drawBlok(M, "1. Yang Menyerahkan", [
    ["Nama", input.returnerName || "..................."],
    ["Jabatan", "Staf Gudang"],
    ["Pabrik", input.plantLabel],
  ]);
  drawBlok(M + blokW + 16, "2. Customer", [
    ["Nama", input.customerName],
    ["Ref. Order", input.docRef || "........................................"],
  ]);
  y -= blokH + 22;

  page.drawText(
    "Telah diserahkan hasil packing makloon dengan rincian sebagai berikut:",
    { x: M, y, size: 10, font: regular }
  );
  y -= 20;

  const rows: Array<[string, string]> = [
    ["Kode Batch", input.batchCode],
    ["Stage Masuk", input.entryStage],
    ["Stage Keluar", input.exitStage],
    ["Jumlah Diterima", `${input.batanganKg} ${input.entryStage === "BATANGAN" ? "kg" : "unit"}`],
    ["Pack Lolos Dikembalikan", `${input.packQty} pack`],
    ["Reject Pack Dikembalikan", `${input.rejectPackQty} pack`],
    ["Reject Batangan Dikembalikan", `${input.rejectBatangQty} batang`],
    ...(input.estimatedWeightKg != null
      ? [["Estimasi Berat Pack", `${input.estimatedWeightKg.toFixed(2)} kg (estimasi)`] as [string, string]]
      : []),
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
