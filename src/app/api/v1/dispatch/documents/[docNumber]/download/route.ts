// GET /dispatch/documents/:docNumber/download — Unduh PDF surat jalan
// PDF di-generate on-demand dari data order (tidak disimpan di DB/Blob).
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import db from "@/db";
import { dispatchDocument } from "@/db/schema/dispatch";
import { buildSuratJalanData, ServiceError } from "@/lib/services/dispatch.service";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ docNumber: string }> }) => {
    try {
      const { docNumber } = await params;

      const [doc] = await db
        .select()
        .from(dispatchDocument)
        .where(eq(dispatchDocument.docNumber, docNumber))
        .limit(1);
      if (!doc) throw new ServiceError("DOC_NOT_FOUND", "Dokumen surat jalan tidak ditemukan.");

      const data = await buildSuratJalanData(doc.orderId);

      const pdf = await buildSuratJalanPdf(docNumber, data);
      return new NextResponse(pdf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${docNumber}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: _ctx.requestId }, { status: 404 });
      }
      throw err;
    }
  },
  { requiredPermission: "dispatch.document.generate" }
);

// =============================================================================
// Layout PDF A4 — kop sederhana + tabel karton + blok tanda tangan
// =============================================================================

async function buildSuratJalanPdf(
  docNumber: string,
  d: Awaited<ReturnType<typeof buildSuratJalanData>>
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  const W = page.getWidth();
  const M = 48; // margin
  const ink = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const line = (y: number, t = 1) =>
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: t, color: t === 1 ? ink : gray });
  const center = (text: string, y: number, size: number, font: typeof bold) =>
    page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: ink });

  const tglIndo = new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });

  let y = 841.89 - 44;

  // ---- Kop perusahaan (tengah) ----
  center(d.plantName, y, 14, bold);
  y -= 17;
  center(d.plantAddress, y, 10, regular);
  y -= 30;

  // ---- Judul + garis ganda ----
  center("SURAT JALAN", y, 17, bold);
  y -= 9;
  line(y, 2);
  y -= 5;
  line(y, 0.6);
  y -= 26;

  // ---- No dokumen + tanggal (kanan atas) ----
  page.drawText(`No: ${docNumber}`, { x: W - M - 180, y, size: 10, font: bold });
  y -= 15;
  page.drawText(`Tanggal: ${tglIndo}`, { x: W - M - 180, y, size: 10, font: regular });
  y -= 8;

  // ---- Blok kepada / pengirim ----
  const leftX = M;
  const rightX = W / 2 + 10;
  page.drawText("KEPADA YTH.:", { x: leftX, y, size: 9, font: bold, color: gray });
  page.drawText(`${d.customerName}`, { x: leftX, y: y - 14, size: 12, font: bold });
  page.drawText(`${d.customerAddress}`, { x: leftX, y: y - 27, size: 10, font: regular });
  page.drawText("DARI:", { x: rightX, y, size: 9, font: bold, color: gray });
  page.drawText(`${d.plantName}`, { x: rightX, y: y - 14, size: 11, font: regular });
  page.drawText(`Sopir: ${d.driverName}`, { x: rightX, y: y - 28, size: 10, font: regular });
  page.drawText(`No. Kendaraan: ${d.vehicleNo}`, { x: rightX, y: y - 42, size: 10, font: regular });
  y -= 72;

  // ---- Tabel karton (boxed) ----
  const colNo = M;
  const colCode = M + 30;
  const colProd = M + 220;
  const colPack = M + 400;
  const colPackW = W - M - colPack;
  const rowH = 20;
  const headerH = 22;
  const tableTop = y;
  const tableBottom = y - headerH - d.cartons.length * rowH;

  // Frame luar
  page.drawRectangle({
    x: M, y: tableBottom, width: W - 2 * M, height: tableTop - tableBottom,
    borderColor: ink, borderWidth: 1,
  });
  // Header
  const headY = y - 16;
  page.drawText("No", { x: colNo + 8, y: headY, size: 9, font: bold, color: gray });
  page.drawText("KODE KARTON", { x: colCode + 6, y: headY, size: 9, font: bold, color: gray });
  page.drawText("PRODUK", { x: colProd + 6, y: headY, size: 9, font: bold, color: gray });
  page.drawText("PACK", { x: colPack + colPackW - 8 - bold.widthOfTextAtSize("PACK", 9), y: headY, size: 9, font: bold, color: gray });
  page.drawLine({ start: { x: M, y: y - headerH + 4 }, end: { x: W - M, y: y - headerH + 4 }, thickness: 1, color: ink });
  // Garis vertikal kolom
  for (const cx of [colCode, colProd, colPack]) {
    page.drawLine({ start: { x: cx, y: tableTop }, end: { x: cx, y: tableBottom }, thickness: 1, color: ink });
  }

  // Baris item
  let rowY = y - headerH - 13;
  d.cartons.forEach((c, i) => {
    page.drawText(String(i + 1), { x: colNo + 9, y: rowY, size: 10, font: regular });
    page.drawText(c.code, { x: colCode + 6, y: rowY, size: 9, font: mono });
    page.drawText(c.productName, { x: colProd + 6, y: rowY, size: 10, font: regular });
    page.drawText(String(c.packCount), { x: colPack + colPackW - 8 - regular.widthOfTextAtSize(String(c.packCount), 10), y: rowY, size: 10, font: regular });
    if (i < d.cartons.length - 1) {
      page.drawLine({ start: { x: M, y: rowY - 6 }, end: { x: W - M, y: rowY - 6 }, thickness: 0.5, color: gray });
    }
    rowY -= rowH;
  });

  // Total
  y = tableBottom - 24;
  page.drawText(`Total: ${d.totalCartons} karton · ${d.totalPacks} pack`, {
    x: M, y, size: 11, font: bold,
  });

  // ---- Catatan ----
  if (d.notes) {
    y -= 18;
    page.drawText(`Catatan: ${d.notes}`, { x: M, y, size: 9, font: regular, color: gray });
  }

  // ---- Blok tanda tangan (3 kolom) ----
  y -= 64;
  const sigW = 140;
  const sigNames = ["Diterima oleh,", "Mengetahui,", "Dikirim oleh,"];
  const sigCaptions = [`( ${d.customerName} )`, `( ${d.plantName} )`, `( ${d.driverName} )`];
  sigNames.forEach((label, i) => {
    const x = M + i * ((W - 2 * M) / 3);
    page.drawText(label, { x, y, size: 10, font: regular, color: gray });
    page.drawLine({ start: { x, y: y - 56 }, end: { x: x + sigW, y: y - 56 }, thickness: 1, color: ink });
    page.drawText(sigCaptions[i]!, { x, y: y - 68, size: 9, font: regular });
  });

  // Footer: order code referensi internal
  page.drawText(`Ref: ${d.orderCode}`, { x: M, y: 36, size: 8, font: regular, color: gray });

  return pdf.save();
}
