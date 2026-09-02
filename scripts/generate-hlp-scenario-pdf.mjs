// =============================================================================
// Generate PDF "Skenario Pengujian Produksi HLP" untuk tim testing.
//
// Pemakaian:  node scripts/generate-hlp-scenario-pdf.mjs
// Output:     docs/skenario-pengujian-hlp.pdf
// Catatan: font standar Helvetica (WinAnsi) — teks tidak boleh memuat
// karakter di luar Latin-1 (-> pengganti panah, x pengganti ×, [ ] untuk ceklis).
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "skenario-pengujian-hlp.pdf");

const SECTIONS = [
  {
    title: "Prasyarat",
    items: [
      "Batch batangan tersedia (kode btc_...). Dibuat dari alur MAKER: buka boks -> timbang sesi -> batch terbentuk. Kalau prod kosong, jalankan skenario MAKER sampai Fase 3 dulu.",
      "Login tablet /tablet/hlp dengan akun operator HLP (permission hlp.pack).",
      "Pilih mesin HLP di pemilih mesin (tombol input operasional aktif hanya jika mesin dipilih).",
      "Untuk verifikasi push (TS-HLP-04): HP QA login sebagai PM/Supervisor plant yang sama.",
      "Untuk verifikasi laporan: web admin (/admin/reports/rijekan, /admin/gudang, laporan material-out).",
    ],
  },
  {
    title: "TS-HLP-01 — Mulai & Tutup Sesi HLP",
    items: [
      "[ ] Buka kartu \"Sesi HLP\" -> tombol buka sesi. HARAPAN: status sesi OPEN tampil; kartu anggota aktif.",
      "[ ] Tambah anggota: \"Tambah Anggota\" -> pilih user -> simpan. HARAPAN: anggota muncul di kartu sesi.",
      "[ ] Catat satu packing (lihat TS-HLP-02). HARAPAN: packing otomatis menempel ke sesi OPEN.",
      "[ ] Tutup sesi manual. HARAPAN: status tertutup; packing berikutnya tercatat TANPA sesi (tetap boleh, tidak error).",
      "[ ] (Opsional) Sesi idle 6 jam (env HLP_SHIFT_IDLE_HOURS) auto-tutup sendiri.",
    ],
  },
  {
    title: "TS-HLP-02 — Catat Hasil Packing (happy path)",
    items: [
      "[ ] Kartu \"Catat Hasil Packing\" -> \"Pilih Boks Batangan\" -> cari kode batch (cth: btc_MKR01) -> pilih batch yang BELUM packing (tampil di urutan atas, tanpa tanda \"sudah packing\").",
      "[ ] Isi: Pack Lolos = 25, Isi per Pack = 20, Reject (batang) = 3, Reject (pack) = 1, alasan = \"uji skenario\".",
      "[ ] Simpan. HARAPAN: dialog \"Hasil Tersimpan\" menampilkan total batang dan berat per batang.",
      "[ ] Hitung silang: total batang = (packsLolos + rejectPacks) x isiPerPack + rejectBatangan = (25 + 1) x 20 + 3 = 523 batang. Berat/batang = batanganKg batch x 1000 / totalBatang (3 desimal).",
      "[ ] HARAPAN lanjutan: batch pindah ke tanda \"sudah packing\", riwayat packing bertambah, dan batch TIDAK bisa dipilih lagi.",
    ],
  },
  {
    title: "TS-HLP-03 — Validasi Negatif Packing",
    items: [
      "[ ] Coba pilih batch yang sudah dicatat packing. HARAPAN: halaman menampilkan peringatan \"Batch ini sudah dicatat packingnya\".",
      "[ ] Coba simpan dengan Pack Lolos = 0 (semua kosong). HARAPAN: ditolak validasi.",
      "[ ] Coba simpan reject pack tanpa alasan. HARAPAN: alasan reject wajib diisi.",
    ],
  },
  {
    title: "TS-HLP-04 — Reject di Atas Ambang -> Push FCM",
    items: [
      "[ ] Catat packing batch lain dengan reject besar, cth: Pack Lolos = 10, Isi per Pack = 20, Reject (pack) = 10. Rasio reject = (10 x 20) / ((10 + 10) x 20) = 50% (> 5%).",
      "[ ] HARAPAN: HP QA (PM/Supervisor) menerima push \"Reject HLP di atas ambang\" dengan data batch_code + ratio_pct.",
      "[ ] Verifikasi web: /admin/reports/rijekan -> entri baru IN_HLP_REJECT (unit BATANG) sejumlah batangan reject.",
    ],
  },
  {
    title: "TS-HLP-05 — Pemakaian & Waste Material",
    items: [
      "[ ] Input Operasional -> \"Pemakaian Material\": pilih material, Jumlah = 2, Alasan = \"pemakaian produksi\" -> simpan. HARAPAN: stok material berkurang; item muncul di kartu \"Bahan di Mesin Ini\".",
      "[ ] \"Waste Material\": pilih material, Jumlah = 1, Alasan = \"bobin sobek saat proses\" -> simpan. HARAPAN: stok berkurang; tercatat sebagai WASTE di laporan material-out (admin).",
      "[ ] Negatif: alasan kurang dari 3 karakter -> HARAPAN: ditolak.",
      "[ ] Catatan: dari tablet, jenis material-out hanya PEMAKAIAN dan WASTE; TRANSFER/RETUR/RUSAK dari web admin gudang.",
    ],
  },
  {
    title: "TS-HLP-06 — Downtime & Maintenance Mesin",
    items: [
      "[ ] Input Operasional -> \"Downtime Mesin\": isi Mulai, Selesai, Alasan = \"ganti material\" -> simpan. HARAPAN: tercatat dengan durasi.",
      "[ ] \"Maintenance\": Deskripsi = \"Ganti pisau filter\" -> simpan. HARAPAN: tercatat.",
      "[ ] Verifikasi web: master-data mesin -> tab maintenance/downtime menampilkan event tadi.",
    ],
  },
  {
    title: "TS-HLP-07 — Produk Jadi Target + Rantai WR -> SLOP -> BAL",
    items: [
      "[ ] Di kartu \"Catat Hasil Packing\": setelah pilih batch, tentukan PRODUK JADI TARGET: PACK (tanpa wrap) / PACK_WRAP / SLOP / BAL. HARAPAN: badge \"Target: ...\" tampil di kartu batch.",
      "[ ] Catat WR: Input = 25 (pack), Output = 24, Reject = 1, mesin KOSONGKAN (manual) -> simpan. HARAPAN: progress batch -> WRAPPED.",
      "[ ] Catat SLOP: Input = 24, Output = 23, Reject = 1. HARAPAN: progress -> SLOPPED.",
      "[ ] Catat BAL: Input = 23, Output = 22, Reject = 1. HARAPAN: progress -> BALED.",
      "[ ] NEGATIF rantai target: target PACK tapi catat WR -> ditolak STAGE_NOT_IN_TARGET. Target SLOP tapi langsung catat SLOP tanpa WR -> ditolak STAGE_SEQUENCE_REQUIRED.",
      "[ ] Ubah target: sebelum ada event bebas; sesudahnya wajib alasan (prompt) -> tersimpan + audit.",
      "[ ] Negatif: Input/Output/Reject semua 0 -> HARAPAN: ditolak (EMPTY_EVENT).",
      "[ ] Catatan: mesin opsional — kegiatan manual boleh tanpa mesin; reject stage BUKAN waste material (waste dicatat di TS-HLP-05).",
      "[ ] Sisa per stage = output stage - input stage berikutnya - isi karton; sisa parsial bisa dikartonkan dalam satuan stage-nya (lihat TS-HLP-08).",
    ],
  },
  {
    title: "TS-HLP-08 — Lanjut ke Karton (Gudang Outbound)",
    items: [
      "[ ] Web admin gudang outbound: buat karton (kode, produk, kapasitas pack).",
      "[ ] \"Isi Pack\": pilih batch yang sudah packing + packQty (cth: 10). HARAPAN: carton_content bertambah; stok pack batch berkurang.",
      "[ ] Negatif 1: isi melebihi kapasitas karton -> HARAPAN: CARTON_FULL.",
      "[ ] Negatif 2: total isi batch melebihi packsLolos -> HARAPAN: PACK_INSUFFICIENT.",
      "[ ] closeCarton -> karton siap dispatch (surat jalan dari admin dispatch).",
    ],
  },
];

const NOTES = [
  "Setiap langkah di atas dicatat audit log; data bisa dicek ulang via web admin.",
  "Push FCM hanya sampai jika token device terdaftar (login mobile) dan belum di-revoke.",
  "Kalau batch habis (semua sudah packing), jalankan ulang alur MAKER untuk membuat batch baru.",
];

// --- Layout constants (A4) ---
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const BOTTOM = 56;

async function main() {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.16, 0.22);
  const gray = rgb(0.42, 0.45, 0.5);
  const accent = rgb(0.07, 0.35, 0.55);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed) => {
    if (y - needed < BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawText = (text, { size, font, color, lineHeight = size * 1.35 }) => {
    ensureSpace(lineHeight + 4);
    page.drawText(text, { x: MARGIN, y, size, font, color, maxWidth: PAGE_W - MARGIN * 2, lineHeight });
    y -= lineHeight + 4;
  };

  const drawWrapped = (text, { size = 10, font = regular, color = ink, lineHeight = 13.5, x = MARGIN }) => {
    const maxWidth = PAGE_W - MARGIN - x;
    const words = text.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        ensureSpace(lineHeight);
        page.drawText(line, { x, y, size, font, color });
        y -= lineHeight;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(lineHeight);
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
    }
    y -= 2;
  };

  // --- Header ---
  drawText("MES HUMMER — SKENARIO PENGUJIAN PRODUKSI HLP", { size: 18, font: bold, color: accent });
  drawText("Sesi HLP, Packing, Material, Downtime, dan Rantai WR-SLOP-BAL", { size: 12, font: bold, color: ink });
  drawText("Versi 1.0 · 2 September 2026 · untuk Tim Testing", { size: 9, font: regular, color: gray });
  y -= 10;

  SECTIONS.forEach((section) => {
    ensureSpace(56);
    drawText(section.title, { size: 11.5, font: bold, color: accent });
    section.items.forEach((item) => {
      drawWrapped(item, { x: MARGIN + 4 });
    });
    y -= 6;
  });

  ensureSpace(60);
  drawText("Catatan Umum", { size: 11.5, font: bold, color: accent });
  NOTES.forEach((n) => drawWrapped("-  " + n, { x: MARGIN + 4, color: gray }));
  y -= 6;

  // --- Footer page numbers ---
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`MES Hummer · Skenario Pengujian HLP · Halaman ${i + 1} dari ${pages.length}`, {
      x: MARGIN, y: 24, size: 7.5, font: regular, color: gray,
    });
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, await doc.save());
  console.log(`PDF dibuat: ${OUT} (${pages.length} halaman)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
