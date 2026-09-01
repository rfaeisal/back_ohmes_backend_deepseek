// =============================================================================
// Berita Acara PDF — generator dokumen formal (serah terima & retur)
// =============================================================================
// PDF asli via pdf-lib (bukan halaman HTML + window.print) supaya tampil
// murni PDF di browser tanpa sidebar admin — pola sama dengan surat jalan
// dispatch. Data dinormalisasi oleh caller (transfer/retur) ke interface ini.
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function formatTanggalId(d: Date): string {
  return `${DAYS_ID[d.getDay()]}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export interface BeritaAcaraInput {
  title: string; // "BERITA ACARA SERAH TERIMA BARANG" | "BERITA ACARA RETUR BARANG"
  nomor: string; // kode dokumen (transferCode/returnCode)
  tanggal: Date;
  pihak1Label: string;
  pihak1Rows: Array<[string, string]>;
  pihak2Label: string;
  pihak2Rows: Array<[string, string]>;
  items: Array<{ boxCode: string; tsgType: string | null; weightKg: number; supplierName?: string | null }>;
  totalBoxCount: number;
  totalWeightKg: number;
  catatan?: string;
  penutup: string;
  sign1Label: string; // "Yang Menyerahkan," dst
  sign1Name: string;
  sign2Label: string;
  sign2Name: string;
  /** Tampilkan kolom "SUPPLIER ASAL" di tabel rincian (dipakai Berita Acara Retur) */
  withSupplierColumn?: boolean;
}

export async function buildBeritaAcaraPdf(input: BeritaAcaraInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  const W = page.getWidth();
  const M = 48;
  const ink = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const center = (text: string, y: number, size: number, font: typeof bold) =>
    page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: ink });

  let y = 841.89 - 44;

  // Kop + judul
  center(input.title, y, 15, bold);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2, color: ink });
  y -= 5;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: ink });
  y -= 20;
  center(`Nomor: ${input.nomor}`, y, 10, bold);
  y -= 30;

  // Pembuka
  page.drawText(
    `Pada hari ini, ${formatTanggalId(input.tanggal)}, yang bertanda tangan di bawah ini:`,
    { x: M, y, size: 10, font: regular, color: ink }
  );
  y -= 24;

  // Dua blok pihak
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
  drawBlok(M, input.pihak1Label, input.pihak1Rows);
  drawBlok(M + blokW + 16, input.pihak2Label, input.pihak2Rows);
  y -= blokH + 22;

  // Pernyataan + tabel
  page.drawText(
    "Telah dilakukan serah terima barang berupa Tembakau Shag Giling (TSG) dengan rincian sebagai berikut:",
    { x: M, y, size: 10, font: regular }
  );
  y -= 18;

  const withSupplier = input.withSupplierColumn === true;
  const colNo = M;
  const colCode = M + 28;
  // 5 kolom (retur): kode lebih sempit, ada kolom SUPPLIER ASAL.
  // 4 kolom (transfer): layout lama tidak berubah.
  const colType = withSupplier ? M + 168 : M + 230;
  const colSup = M + 252;
  const colKg = M + 360;
  const supplierCellW = colKg - colSup - 8; // lebar teks supplier (104pt)
  const rowH = 20;
  const headerH = 22;
  const tableTop = y;
  const tableBottom = y - headerH - input.items.length * rowH - rowH; // + baris total

  // Potong teks supaya muat di kolomnya (pdf-lib tidak auto-wrap)
  const fit = (text: string, maxW: number, font: typeof regular, size: number) => {
    if (font.widthOfTextAtSize(text, size) <= maxW) return text;
    let t = text;
    while (t.length > 2 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  page.drawRectangle({ x: M, y: tableBottom, width: W - 2 * M, height: tableTop - tableBottom, borderColor: ink, borderWidth: 1 });
  const headY = y - 16;
  page.drawText("No", { x: colNo + 8, y: headY, size: 9, font: bold, color: gray });
  page.drawText("KODE BOKS", { x: colCode + 6, y: headY, size: 9, font: bold, color: gray });
  page.drawText("JENIS TSG", { x: colType + 6, y: headY, size: 9, font: bold, color: gray });
  if (withSupplier) {
    page.drawText("SUPPLIER ASAL", { x: colSup + 6, y: headY, size: 8, font: bold, color: gray });
  }
  page.drawText("BERAT (KG)", { x: W - M - 8 - bold.widthOfTextAtSize("BERAT (KG)", 9), y: headY, size: 9, font: bold, color: gray });
  page.drawLine({ start: { x: M, y: y - headerH + 4 }, end: { x: W - M, y: y - headerH + 4 }, thickness: 1, color: ink });
  for (const cx of withSupplier ? [colCode, colType, colSup, colKg] : [colCode, colType, colKg]) {
    page.drawLine({ start: { x: cx, y: tableTop }, end: { x: cx, y: tableBottom }, thickness: 1, color: ink });
  }

  let rowY = y - headerH - 13;
  input.items.forEach((it, i) => {
    page.drawText(String(i + 1), { x: colNo + 9, y: rowY, size: 10, font: regular });
    page.drawText(it.boxCode, { x: colCode + 6, y: rowY, size: 9, font: mono });
    page.drawText(it.tsgType ?? "-", { x: colType + 6, y: rowY, size: 10, font: regular });
    if (withSupplier) {
      page.drawText(fit(it.supplierName ?? "-", supplierCellW, regular, 8), { x: colSup + 6, y: rowY + 1, size: 8, font: regular });
    }
    page.drawText(Number(it.weightKg).toFixed(2), { x: W - M - 8 - regular.widthOfTextAtSize(Number(it.weightKg).toFixed(2), 10), y: rowY, size: 10, font: regular });
    if (i < input.items.length - 1) {
      page.drawLine({ start: { x: M, y: rowY - 6 }, end: { x: W - M, y: rowY - 6 }, thickness: 0.5, color: gray });
    }
    rowY -= rowH;
  });

  // Baris total
  page.drawLine({ start: { x: M, y: rowY + 6 }, end: { x: W - M, y: rowY + 6 }, thickness: 1, color: ink });
  page.drawText("TOTAL", { x: colCode + 6, y: rowY - 4, size: 9, font: bold });
  page.drawText(`${input.totalBoxCount} boks`, { x: (withSupplier ? colSup : colType) + 6, y: rowY - 4, size: 9, font: bold });
  page.drawText(Number(input.totalWeightKg).toFixed(2), { x: W - M - 8 - bold.widthOfTextAtSize(Number(input.totalWeightKg).toFixed(2), 9), y: rowY - 4, size: 9, font: bold });

  y = tableBottom - 22;
  if (input.catatan) {
    page.drawText(`Catatan: ${input.catatan}`, { x: M, y, size: 9, font: regular, color: gray });
    y -= 16;
  }
  y -= 6;
  page.drawText(input.penutup, { x: M, y, size: 10, font: regular });

  // Tanda tangan
  y -= 90;
  const sigW = 160;
  const sigs = [
    { label: input.sign1Label, name: input.sign1Name },
    { label: input.sign2Label, name: input.sign2Name },
  ];
  sigs.forEach((s, i) => {
    const x = M + i * ((W - 2 * M) / 2);
    page.drawText(s.label, { x, y, size: 10, font: regular, color: gray });
    page.drawLine({ start: { x, y: y - 58 }, end: { x: x + sigW, y: y - 58 }, thickness: 1, color: ink });
    page.drawText(s.name, { x, y: y - 70, size: 9, font: bold });
  });

  return pdf.save();
}
