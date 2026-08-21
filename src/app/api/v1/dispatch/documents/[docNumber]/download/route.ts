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
  const gray = rgb(0.35, 0.35, 0.35);
  let y = 841.89 - 56;

  // Kop
  page.drawText("SURAT JALAN", { x: M, y, size: 22, font: bold, color: ink });
  y -= 24;
  page.drawText(`${d.plantName} — ${d.plantAddress}`, { x: M, y, size: 10, font: regular, color: gray });
  y -= 16;
  page.drawText(`No. ${docNumber}`, { x: M, y, size: 12, font: bold });
  page.drawText(`Tanggal: ${d.date}`, { x: W - M - 110, y, size: 10, font: regular, color: gray });
  y -= 28;

  // Garis pemisah
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: ink });
  y -= 26;

  // Blok customer
  const leftX = M;
  const rightX = W / 2 + 8;
  page.drawText("KEPADA:", { x: leftX, y, size: 9, font: bold, color: gray });
  page.drawText(`${d.customerName}`, { x: leftX, y: y - 14, size: 12, font: bold });
  page.drawText(`${d.customerAddress}`, { x: leftX, y: y - 28, size: 10, font: regular, color: gray });
  page.drawText("PENGIRIM:", { x: rightX, y, size: 9, font: bold, color: gray });
  page.drawText(`Sopir: ${d.driverName}`, { x: rightX, y: y - 14, size: 11, font: regular });
  page.drawText(`Kendaraan: ${d.vehicleNo}`, { x: rightX, y: y - 28, size: 11, font: regular });
  y -= 58;

  // Tabel karton
  const col1 = M;
  const col2 = M + 190;
  const col3 = M + 330;
  const col4 = W - M - 60;
  const rowH = 22;
  page.drawText("KODE KARTON", { x: col1, y, size: 9, font: bold, color: gray });
  page.drawText("PRODUK", { x: col2, y, size: 9, font: bold, color: gray });
  page.drawText("PACK", { x: col3, y, size: 9, font: bold, color: gray });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: ink });
  y -= rowH;

  for (const c of d.cartons) {
    page.drawText(c.code, { x: col1, y, size: 10, font: mono });
    page.drawText(c.productName, { x: col2, y, size: 10, font: regular });
    page.drawText(String(c.packCount), { x: col4, y, size: 10, font: regular });
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: gray });
  }

  y -= 18;
  page.drawText(`Total: ${d.totalCartons} karton · ${d.totalPacks} pack`, {
    x: M, y, size: 11, font: bold,
  });
  y -= 44;

  // Blok tanda tangan
  const sigW = 150;
  page.drawText("Diterima oleh,", { x: M, y, size: 10, font: regular, color: gray });
  page.drawText("Dikirim oleh,", { x: W - M - sigW, y, size: 10, font: regular, color: gray });
  page.drawLine({ start: { x: M, y: y - 58 }, end: { x: M + sigW, y: y - 58 }, thickness: 1, color: ink });
  page.drawLine({ start: { x: W - M - sigW, y: y - 58 }, end: { x: W - M, y: y - 58 }, thickness: 1, color: ink });
  y -= 76;
  page.drawText(`( ${d.customerName} )`, { x: M, y, size: 10, font: regular });
  page.drawText(`( ${d.driverName} )`, { x: W - M - sigW, y, size: 10, font: regular });

  // Footer: order code untuk referensi internal
  page.drawText(`Order: ${d.orderCode}`, {
    x: M, y: 40, size: 8, font: regular, color: gray,
  });

  return pdf.save();
}
