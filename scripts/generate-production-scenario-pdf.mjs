// =============================================================================
// Generate PDF "Skenario Pengujian Produksi Lengkap" — MAKER sampai karton.
//
// Pemakaian:  node scripts/generate-production-scenario-pdf.mjs
// Output:     docs/skenario-pengujian-produksi.pdf
// Catatan: font standar Helvetica (WinAnsi) — teks tidak boleh memuat
// karakter di luar Latin-1 (-> pengganti panah, x pengganti ×, [ ] ceklis).
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "skenario-pengujian-produksi.pdf");

const SECTIONS = [
  {
    title: "Prasyarat",
    items: [
      "Inventory TSG tersedia dengan status AVAILABLE (cek /admin/reports/tsg-stock). Kalau kosong: receiving dulu, atau pakai scripts/reset-transactions.sql untuk mengembalikan USED/ALLOCATED menjadi AVAILABLE.",
      "Akun uji: Operator MAKER (OPERATOR_KECER/OPERATOR_MEMBER), PM/Supervisor (approve), Operator HLP, Admin Gudang Outbound, Admin Dispatch — 13 test user tersedia, password seragam.",
      "HP QA login sebagai PM/Supervisor plant yang sama untuk verifikasi push FCM.",
      "Tablet lantai produksi: buka /tablet (start-shift, shift aktif) dan /tablet/hlp.",
    ],
  },
  {
    title: "TS-PROD-01 — Start Shift (MAKER)",
    items: [
      "[ ] /tablet/start-shift -> pilih mesin MAKER dan produk. HARAPAN: anggota roster auto-pick muncul (role + nama).",
      "[ ] Simpan. HARAPAN: masuk halaman shift aktif, status RUNNING.",
      "[ ] NEGATIF: pilih mesin HLP/WR -> HARAPAN: ditolak MACHINE_NOT_MAKER.",
      "[ ] NEGATIF: mesin yang masih punya shift RUNNING -> HARAPAN: ditolak MACHINE_HAS_RUNNING_SHIFT.",
    ],
  },
  {
    title: "TS-PROD-02 — Buka Boks TSG (sesi 1-6 boks)",
    items: [
      "[ ] Halaman shift aktif -> BUKA BOKS BARU -> pilih 2-3 boks dari daftar inventory. HARAPAN: setiap boks menampilkan jenis TSG (REGULER/MILD/PUTIHAN), boxCode, berat TSG.",
      "[ ] HARAPAN: boks aktif muncul dengan #nomor + kode + jenis.",
      "[ ] Cek stok: /admin/reports/tsg-stock -> boks tadi berubah menjadi USED.",
      "[ ] NEGATIF: boks yang sudah USED tidak muncul lagi di daftar AVAILABLE.",
      "[ ] (Opsional) catat event sesi: pemakaian consumable, downtime, maintenance.",
    ],
  },
  {
    title: "TS-PROD-03 — Timbang Batangan -> Batch btc_",
    items: [
      "[ ] Isi berat total batangan (timbangan kolektif) -> simpan. HARAPAN: pembagian proporsional per boks + yield per boks + badge NORMAL/WARNING.",
      "[ ] Hitung silang: 2 boks TSG 30 kg + 20 kg, total batangan 55 kg -> output 33 kg dan 22 kg; yield 33/30 = 110% dan 22/20 = 110%.",
      "[ ] HARAPAN: kartu Boks Selesai menampilkan #nomor, kode, JENIS TSG, output/input, yield, dan kode batch btc_<mesin>_<tgl>_<seq>.",
      "[ ] NEGATIF: berat 0 atau negatif -> INVALID_WEIGHT.",
      "[ ] NEGATIF: timbang sesi yang sudah WEIGHED -> SESSION_ALREADY_WEIGHED.",
      "[ ] NEGATIF: timbang sesi tanpa boks -> SESSION_EMPTY.",
    ],
  },
  {
    title: "TS-PROD-04 — End Shift -> COMPLETED + Push",
    items: [
      "[ ] Isi waste 4 kategori (MENIR, RIJEKAN, DEBU_KASAR, DEBU_HALUS) + consumable shift -> AKHIRI SHIFT. HARAPAN: shift -> COMPLETED.",
      "[ ] NEGATIF: waste kurang satu kategori -> WASTE_INCOMPLETE.",
      "[ ] NEGATIF: masih ada boks aktif belum ditimbang -> SHIFT_HAS_ACTIVE_BOX (timbang dulu atau buat handoff).",
      "[ ] HARAPAN: HP QA (PM/Supervisor) menerima push SHIFT_COMPLETED; tap notifikasi -> mobile deep-link ke detail shift.",
      "[ ] (Opsional handoff) boks tersisa -> buat handoff -> shift berikutnya di mesin lain mendapat boks partial otomatis (isPartial).",
    ],
  },
  {
    title: "TS-PROD-05 — Approve -> LOCKED",
    items: [
      "[ ] PM/Supervisor buka detail shift (mobile atau web) -> lihat boks + jenis TSG + yield -> approve (+ catatan).",
      "[ ] HARAPAN: status APPROVED (LOCKED); edit data produksi ditolak — perubahan hanya via CORRECTION.",
      "[ ] HARAPAN: finished_goods_receiving PENDING terbentuk dengan packsExpectedCount = total pack batch shift ini.",
      "[ ] (Opsional) reopen dengan alasan -> approve ulang. HARAPAN: ekspektasi receiving TIDAK dobel (idempotent).",
    ],
  },
  {
    title: "TS-PROD-06 — HLP Packing + Produk Jadi Target (rangkuman)",
    items: [
      "[ ] /tablet/hlp -> pilih batch btc_ yang belum packing -> pilih Produk Jadi Target: PACK / PACK_WRAP / SLOP / BAL (default PACK).",
      "[ ] Catat packing: packsLolos, isiPerPack, reject + alasan. HARAPAN: total batang + berat/batang tampil; batch terkunci (1 batch = 1 kali catat).",
      "[ ] HARAPAN: badge Target tampil di kartu batch; stage di luar target ditolak (STAGE_NOT_IN_TARGET) dan loncat urutan ditolak (STAGE_SEQUENCE_REQUIRED).",
      "[ ] Detail lengkap (sesi, reject ambang 5% + FCM, material, downtime, rantai WR-SLOP-BAL): lihat PDF skenario-pengujian-hlp.pdf (TS-HLP-01 s/d 08).",
    ],
  },
  {
    title: "TS-PROD-07 — Karton Multi-Satuan (Gudang Outbound)",
    items: [
      "[ ] Admin gudang: buat karton (kode, produk, UNIT: PACK/SLOP/BAL, kapasitas).",
      "[ ] Isi karton: PACK -> sumber \"Pack dari HLP\" atau \"Hasil WR (pack terwrap)\"; SLOP -> \"Hasil SLOP\"; BAL -> \"Hasil BAL\" (dropdown menampilkan kode batch + sisa).",
      "[ ] HARAPAN: carton_content bertambah; sisa stage berkurang sesuai isi.",
      "[ ] NEGATIF: isi melebihi kapasitas -> CARTON_FULL.",
      "[ ] NEGATIF: melebihi sisa packsLolos -> PACK_INSUFFICIENT; melebihi sisa output stage -> STAGE_OUTPUT_INSUFFICIENT.",
      "[ ] NEGATIF: isi tidak se-unit dengan karton -> UNIT_MISMATCH.",
      "[ ] closeCarton -> karton siap dispatch.",
    ],
  },
  {
    title: "TS-PROD-08 — Dispatch & Surat Jalan",
    items: [
      "[ ] Buat dispatch order: pilih karton -> simpan. HARAPAN: dispatch_order + dispatch_item terbentuk.",
      "[ ] Unduh dokumen: /dispatch/documents/[docNumber]/download. HARAPAN: PDF surat jalan resmi (kop, tabel boxed, 3 tanda tangan).",
      "[ ] Penerima: confirmReceiving packsActualCount vs packsExpectedCount. HARAPAN: loop tertutup dengan ekspektasi dari TS-PROD-05.",
    ],
  },
];

const NOTES = [
  "Seluruh langkah tercatat audit log — bisa dicek via admin.",
  "Push FCM hanya sampai jika token device terdaftar (login mobile) dan belum di-revoke.",
  "Mau ulang dari bersih: scripts/reset-transactions.sql (reset shift + inventory, tanpa re-seed).",
  "Referensi alur: docs/alur-produksi-maker-ke-karton.pdf.",
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
  drawText("MES HUMMER — SKENARIO PENGUJIAN PRODUKSI LENGKAP", { size: 18, font: bold, color: accent });
  drawText("Start Shift MAKER -> Boks TSG -> Batch -> HLP -> Karton -> Dispatch", { size: 12, font: bold, color: ink });
  drawText("Versi 1.0 · 2 September 2026 · untuk Tim Testing", { size: 9, font: regular, color: gray });
  y -= 10;

  SECTIONS.forEach((section) => {
    ensureSpace(52);
    drawText(section.title, { size: 11.5, font: bold, color: accent });
    section.items.forEach((item) => {
      drawWrapped(item, { x: MARGIN + 4 });
    });
    y -= 6;
  });

  ensureSpace(56);
  drawText("Catatan Umum", { size: 11.5, font: bold, color: accent });
  NOTES.forEach((n) => drawWrapped("-  " + n, { x: MARGIN + 4, color: gray }));

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`MES Hummer · Skenario Pengujian Produksi · Halaman ${i + 1} dari ${pages.length}`, {
      x: MARGIN, y: 24, size: 7.5, font: regular, color: gray,
    });
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, await doc.save());
  console.log(`PDF dibuat: ${OUT} (${pages.length} halaman)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
