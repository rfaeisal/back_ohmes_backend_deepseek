// =============================================================================
// Material Retur PDF — Berita Acara Retur Material (consumable & sparepart)
// =============================================================================
// PDF asli via pdf-lib, pola sama dengan berita-acara-pdf.service.ts (TSG).
// Kolom rincian: No | NAMA BARANG | QTY | SATUAN.
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatTanggalId } from "./berita-acara-pdf.service";

export interface MaterialReturPdfInput {
  nomor: string; // outCode, mis. MTR-20260901-01
  tanggal: Date;
  returnerName: string;
  plantLabel: string; // "Pabrik Kadur 1 (PLT-PMK-01)"
  supplierName: string; // counterpartName (nama supplier tujuan retur)
  items: Array<{ name: string; quantity: number; unit: string }>;
  reason: string;
  notes?: string | null;
}

export async function buildMaterialReturPdf(input: MaterialReturPdfInput): Promise<Uint8Array> {
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

  // Potong teks supaya muat di kolom (pdf-lib tidak auto-wrap)
  const fit = (text: string, maxW: number, font: typeof regular, size: number) => {
    if (font.widthOfTextAtSize(text, size) <= maxW) return text;
    let t = text;
    while (t.length > 2 && font.widthOfTextAtSize(t + "…", size) > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  // Format qty: bulat tanpa desimal, pecahan 2 angka tanpa nol belakang
  const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : String(Number(q.toFixed(2))));

  let y = 841.89 - 44;

  // Kop + judul
  center("BERITA ACARA RETUR MATERIAL", y, 15, bold);
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
  drawBlok(M, "1. Yang Meretur", [
    ["Nama", input.returnerName || "..................."],
    ["Jabatan", "Staf Gudang"],
    ["Pabrik", input.plantLabel],
  ]);
  drawBlok(M + blokW + 16, "2. Supplier", [
    ["Nama", input.supplierName || "........................................"],
    ["Alamat", "........................................"],
  ]);
  y -= blokH + 22;

  // Pernyataan + tabel
  page.drawText(
    "Telah dilakukan serah terima barang berupa Material & Sparepart dengan rincian sebagai berikut:",
    { x: M, y, size: 10, font: regular }
  );
  y -= 18;

  const colNo = M;
  const colName = M + 28;
  const colQty = M + 320;
  const colUnit = M + 400;
  const rowH = 20;
  const headerH = 22;
  const tableTop = y;
  const tableBottom = y - headerH - input.items.length * rowH - rowH; // + baris total

  page.drawRectangle({ x: M, y: tableBottom, width: W - 2 * M, height: tableTop - tableBottom, borderColor: ink, borderWidth: 1 });
  const headY = y - 16;
  page.drawText("No", { x: colNo + 8, y: headY, size: 9, font: bold, color: gray });
  page.drawText("NAMA BARANG", { x: colName + 6, y: headY, size: 9, font: bold, color: gray });
  page.drawText("QTY", { x: colQty + 6, y: headY, size: 9, font: bold, color: gray });
  page.drawText("SATUAN", { x: colUnit + 6, y: headY, size: 9, font: bold, color: gray });
  page.drawLine({ start: { x: M, y: y - headerH + 4 }, end: { x: W - M, y: y - headerH + 4 }, thickness: 1, color: ink });
  for (const cx of [colName, colQty, colUnit]) {
    page.drawLine({ start: { x: cx, y: tableTop }, end: { x: cx, y: tableBottom }, thickness: 1, color: ink });
  }

  let rowY = y - headerH - 13;
  input.items.forEach((it, i) => {
    page.drawText(String(i + 1), { x: colNo + 9, y: rowY, size: 10, font: regular });
    page.drawText(fit(it.name, colQty - colName - 12, regular, 9), { x: colName + 6, y: rowY, size: 9, font: regular });
    page.drawText(fmtQty(it.quantity), { x: colQty + 6, y: rowY, size: 10, font: mono });
    page.drawText(it.unit || "-", { x: colUnit + 6, y: rowY, size: 9, font: regular });
    if (i < input.items.length - 1) {
      page.drawLine({ start: { x: M, y: rowY - 6 }, end: { x: W - M, y: rowY - 6 }, thickness: 0.5, color: gray });
    }
    rowY -= rowH;
  });

  // Baris total
  page.drawLine({ start: { x: M, y: rowY + 6 }, end: { x: W - M, y: rowY + 6 }, thickness: 1, color: ink });
  page.drawText("TOTAL", { x: colName + 6, y: rowY - 4, size: 9, font: bold });
  page.drawText(`${input.items.length} item`, { x: colQty + 6, y: rowY - 4, size: 9, font: bold });

  y = tableBottom - 22;
  page.drawText(`Alasan: ${input.reason}`, { x: M, y, size: 9, font: regular, color: gray });
  y -= 16;
  if (input.notes) {
    page.drawText(`Catatan: ${input.notes}`, { x: M, y, size: 9, font: regular, color: gray });
    y -= 16;
  }
  y -= 6;
  page.drawText(
    "Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.",
    { x: M, y, size: 10, font: regular }
  );

  // Tanda tangan
  y -= 90;
  const sigW = 160;
  const sigs = [
    { label: "Yang Meretur,", name: input.returnerName || "..................." },
    { label: "Pihak Supplier,", name: "........................................" },
  ];
  sigs.forEach((s, i) => {
    const x = M + i * ((W - 2 * M) / 2);
    page.drawText(s.label, { x, y, size: 10, font: regular, color: gray });
    page.drawLine({ start: { x, y: y - 58 }, end: { x: x + sigW, y: y - 58 }, thickness: 1, color: ink });
    page.drawText(s.name, { x, y: y - 70, size: 9, font: bold });
  });

  return pdf.save();
}
