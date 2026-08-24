// =============================================================================
// Pool Label PDF — generator PDF multi-halaman untuk XPrinter 420B
// =============================================================================
// 1 label = 1 halaman, ukuran presisi 100×75mm, layout final hasil desain:
// QR 44mm kiri + caption/hint, 3 jenis TSG kanan (huruf besar R/M/P 43pt
// bold rapat di kotak centang 7mm, TANPA frame baris), kotak vertikal
// angka 1–5 (28pt bold) di ujung kanan, kode boks 16pt Courier bold di
// bawah. Hitam-putih, ramah thermal.
// =============================================================================

import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MM = 2.83465; // pt per mm
const PAGE_W = 100 * MM;
const PAGE_H = 75 * MM;

export async function buildPoolLabelPdf(boxCodes: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);

  for (const code of boxCodes) {
    const page = doc.addPage([PAGE_W, PAGE_H]);

    // ---- QR (44×44mm, kolom kiri 48mm, geser 2mm dari kiri kolom) ----
    const qrSize = 44 * MM;
    const qrX = 5 * MM; // 3mm padding label + 2mm margin kolom
    const qrY = PAGE_H - 7 * MM - qrSize; // 7mm dari atas (keputusan user: turun ±5mm)
    const qrPng = await QRCode.toBuffer(code, {
      type: "png",
      margin: 1,
      width: 512,
      errorCorrectionLevel: "M",
    });
    const qrImg = await doc.embedPng(qrPng);
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    // ---- Caption + hint (center di bawah QR) ----
    const zoneCenterX = qrX + qrSize / 2;
    const caption = "SCAN SAAT TIMBANG";
    const capSize = 10;
    let y = qrY - 1.5 * MM - bold.heightAtSize(capSize);
    page.drawText(caption, {
      x: zoneCenterX - bold.widthOfTextAtSize(caption, capSize) / 2,
      y,
      size: capSize,
      font: bold,
    });

    const hintSize = 7;
    const hints = ["Pindai QR sebelum", "menimbang boks"];
    for (const hint of hints) {
      y -= 1.5 * MM + bold.heightAtSize(hintSize);
      page.drawText(hint, {
        x: zoneCenterX - bold.widthOfTextAtSize(hint, hintSize) / 2,
        y,
        size: hintSize,
        font: bold,
      });
    }

    // ---- Kolom kanan: 3 jenis TSG (huruf besar R/M/P tanpa frame) + kotak angka 1–5 ----
    const colX = 53 * MM; // 3 padding + 48 kolom QR + 2 gap
    const numBoxX = 82 * MM; // kotak vertikal angka di ujung kanan (dilebarkan utk angka besar)
    const footerBottom = 2.5 * MM;
    const codeSize = 16;
    const footerTop = footerBottom + mono.heightAtSize(codeSize) + 1.2 * MM;
    const topY = PAGE_H - 3 * MM - 2 * MM; // padding atas 3mm + padding zona 2mm
    const gap = 3.5 * MM;
    const rowH = (topY - footerTop - 2 * gap) / 3;

    // Inisial jenis TSG — font besar tebal (keputusan user: REGULER/MILD/
    // PUTIHAN diganti R/M/P supaya terbaca dari jauh saat sortir fisik).
    // Tanpa frame baris — cuma kotak centang + huruf.
    const types = ["R", "M", "P"] as const;
    types.forEach((name, i) => {
      const rowTop = topY - i * (rowH + gap);
      const rowBottom = rowTop - rowH;

      const tick = 7 * MM;
      const tickX = colX + 2 * MM;
      const tickY = rowBottom + (rowH - tick) / 2;
      page.drawRectangle({
        x: tickX,
        y: tickY,
        width: tick,
        height: tick,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.5,
      });

      // Huruf besar rapat di kanan kotak centang (+20% dari 36pt).
      // Center pakai tinggi kapital (cap ≈ 0.72em) — bukan em-box — supaya
      // huruf dan kotak centang sejajar vertikal tengah secara visual.
      const nameSize = 43;
      const capH = nameSize * 0.72;
      page.drawText(name, {
        x: tickX + tick + 2.2 * MM,
        y: rowBottom + (rowH - capH) / 2,
        size: nameSize,
        font: bold,
      });
    });

    // ---- Kotak vertikal angka 1–5 (kanan, dari atas ke bawah) ----
    page.drawRectangle({
      x: numBoxX,
      y: footerTop,
      width: 92 * MM - numBoxX, // sampai margin kanan label
      height: topY - footerTop,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
    });
    const numSize = 34; // 28pt + 20% — keputusan user
    const numCount = 5;
    const numStep = (topY - footerTop) / numCount;
    for (let n = 0; n < numCount; n++) {
      const label = String(n + 1);
      const numCenterY = footerTop + numStep * (numCount - n - 1) + numStep / 2;
      page.drawText(label, {
        x: numBoxX + (92 * MM - numBoxX) / 2 - bold.widthOfTextAtSize(label, numSize) / 2,
        y: numCenterY - (numSize * 0.72) / 2, // center pada tinggi kapital
        size: numSize,
        font: bold,
      });
    }

    // ---- Kode boks (16pt Courier bold, center bawah) ----
    page.drawText(code, {
      x: (PAGE_W - mono.widthOfTextAtSize(code, codeSize)) / 2,
      y: footerBottom + 1.2 * MM,
      size: codeSize,
      font: mono,
    });
  }

  return doc.save();
}
