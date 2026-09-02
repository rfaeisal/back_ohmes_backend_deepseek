// =============================================================================
// Generate PDF "Alur Produksi: Start Shift MAKER sampai Kemasan Karton"
// untuk dibagikan ke tim testing.
//
// Pemakaian:  node scripts/generate-workflow-pdf.mjs
// Output:     docs/alur-produksi-maker-ke-karton.pdf
// Catatan: font standar Helvetica (WinAnsi) — teks tidak boleh memuat
// karakter di luar Latin-1 (-> pengganti panah, x pengganti ×).
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "alur-produksi-maker-ke-karton.pdf");

const CONTENT = [
  {
    title: "Fase 1 — Start Shift (Operator MAKER, tablet /tablet/start-shift)",
    items: [
      "Login tablet, pilih mesin MAKER (mesin HLP ditolak server: MACHINE_NOT_MAKER), pilih produk terdaftar di plant.",
      "Roster auto-pick: anggota + shift role terisi dari roster mingguan (minimal 1 anggota berhak end shift).",
      "Validasi: mesin tidak boleh punya shift RUNNING (MACHINE_HAS_RUNNING_SHIFT).",
      "Jika ada handoff dari shift sebelumnya: server membuat boks partial otomatis (isPartial=true, HANDOFF-xxxx, berisi sisa TSG) dan meng-claim handoff.",
      "Hasil: shift_report status RUNNING + shift_member + audit log shift.start.",
    ],
  },
  {
    title: "Fase 2 — Buka Boks TSG (tablet /tablet/shift/[id])",
    items: [
      "Pilih 1–6 boks dari inventory AVAILABLE (wajib dari inventory, prinsip FIFO; override FIFO butuh permission + audit alasan). Setiap boks memiliki jenis TSG (REGULER / MILD / PUTIHAN).",
      "POST /shifts/:id/box-sessions (permission shift.box.open): validasi AVAILABLE + plant scope + jumlah 1–6 + anti-duplikat.",
      "Terbentuk tsg_box_session OPEN + tsg_box_process per boks (boxNumber otomatis; boxCode dan tsgWeightKg diambil dari inventory; opsional realWeightKg = berat timbangan pabrik aktual).",
      "Efek stok: tsg_inventory.status -> USED (+usedAt).",
      "Selama boks aktif: catat pemakaian consumable (tsg_box_consumption), downtime (downtime_log), maintenance (maintenance_event).",
    ],
  },
  {
    title: "Fase 3 — Timbang Batangan Kolektif -> Batch btc_…",
    items: [
      "Timbang total batangan sekali untuk seluruh boks sesi: POST /box-sessions/:id/weigh (permission shift.box.weigh).",
      "Kalkulasi server-side: total dibagi proporsional bobot TSG tiap boks; yield per boks = output/input x 100, dibandingkan range MachineTemplate produk (default NORMAL 110–114%). Di luar range: WARNING + pertanyaan alasan wajib.",
      "Semua boks diberi completedAt; sesi -> WEIGHED.",
      "Terbentuk batch batangan: kode btc_<kodeMesin>_<YYYYMMDD>_<seq> (urutan per hari per mesin), batanganKg = total timbangan, source INTERNAL, stage PACKED.",
      "Mulai titik ini, boks TSG berubah wujud menjadi batch batangan yang siap ke HLP.",
    ],
  },
  {
    title: "Fase 4 — End Shift -> COMPLETED + Push FCM",
    items: [
      "Wajib isi 4 kategori waste: MENIR, RIJEKAN, DEBU_KASAR, DEBU_HALUS (server menolak jika kurang: WASTE_INCOMPLETE) + consumable level shift (karton, dus, dll).",
      "Tidak boleh ada boks aktif: wajib ditimbang dulu, atau dibuat handoff (sisa TSG diteruskan ke shift berikutnya, boleh beda mesin; shift baru otomatis mendapat boks partial).",
      "POST /shifts/:id/end -> shift_report COMPLETED (+actualEnd), waste + consumption tersimpan, audit shift.end.",
      "FCM push SHIFT_COMPLETED ke PM + Shift Supervisor plant: data { type: \"SHIFT_COMPLETED\", shift_id, ... }. Tap notifikasi di mobile langsung deep-link ke detail shift.",
    ],
  },
  {
    title: "Fase 5 — Approve (PM / Supervisor) -> LOCKED",
    items: [
      "Buka detail shift (mobile deep-link atau web): lihat boks + jenis TSG + yield per boks.",
      "POST /shifts/:id/approve (permission shift.approve) -> status APPROVED = LOCKED; perubahan apa pun hanya via CORRECTION.",
      "autoCreateFinishedGoods (idempotent): server menjumlahkan packsLolos semua batch shift ini -> membuat finished_goods_receiving PENDING = ekspektasi jumlah pack yang akan diterima gudang FG.",
      "Approve bisa di-reopen (dengan alasan + audit) lalu di-approve ulang.",
    ],
  },
  {
    title: "Fase 6 — HLP: Packing Batangan -> Pack (tablet /tablet/hlp)",
    items: [
      "Pilih batch batangan (btc_…, stage PACKED). Batch yang belum dicatat packing tampil di atas; batch yang sudah packing ditandai dan diblokir (HLP_BATCH_ALREADY_PACKED — satu batch hanya boleh dicatat sekali).",
      "Catat hasil packing: packsLolos, isiPerPack (default 20), rejectBatangan, rejectPacks + alasan -> POST /api/v1/hlp/packs (permission hlp.pack).",
      "Server menghitung totalBatang dan beratPerBatangGram -> menyimpan hlp_pack. Jika ada sesi HLP OPEN di mesin itu, packing otomatis menempel ke sesi; tanpa sesi, packing standalone tetap boleh.",
      "Ada reject -> masuk ledger rijekan (IN_HLP_REJECT, unit BATANG). Rasio reject > 5% -> FCM HLP_REJECT_HIGH ke PM + supervisor.",
      "Rantai lanjutan opsional: batch_stage_event WR (wrap) -> SLOP -> BAL; batch.stage maju PACKED -> WRAPPED -> SLOPPED -> BALED.",
    ],
  },
  {
    title: "Fase 7 — Gudang Outbound: Karton (admin gudang, /admin/gudang)",
    items: [
      "Buat karton: POST /cartons (permission cartoning.create) — kode karton, produk, kapasitas pack (capacityPack).",
      "\"Isi Pack\": POST /cartons/:id/packs — pilih batch + packQty (jumlah pack fisik dari batch itu) -> baris carton_content.",
      "Validasi server: CARTON_FULL (total isi + packQty melebihi kapasitas karton -> ditolak) dan PACK_INSUFFICIENT (packQty melebihi sisa packsLolos batch yang belum dialokasikan ke karton lain -> ditolak). Satu batch boleh dipecah ke beberapa karton, tidak boleh dicatat dua kali.",
      "closeCarton -> karton siap kirim.",
    ],
  },
  {
    title: "Fase 8 — Dispatch & Surat Jalan",
    items: [
      "POST /dispatch/orders (permission dispatch.order.create): pilih karton yang akan dikirim -> dispatch_order + dispatch_item.",
      "GET /dispatch/documents/[docNumber]/download -> surat jalan PDF resmi (kop, tabel boxed, 3 tanda tangan).",
      "Di sisi penerima: confirmReceiving mencocokkan packsActualCount vs packsExpectedCount dari finished_goods_receiving (dibuat saat approve) -> loop tertutup dari Fase 5.",
    ],
  },
];

const CHAIN = [
  "shift_report (RUNNING)",
  "tsg_box_session + tsg_box_process (inventory USED)",
  "batch btc_… (WEIGHED)",
  "COMPLETED + push FCM",
  "APPROVED / LOCKED + ekspektasi FG",
  "hlp_pack",
  "carton_content",
  "dispatch_order",
  "PDF surat jalan",
  "receiving FG",
];

const ACTORS = [
  ["Operator MAKER", "Fase 1–4", "Tablet /tablet"],
  ["PM / Supervisor", "Fase 5", "Mobile / Web"],
  ["Operator HLP", "Fase 6", "Tablet /tablet/hlp"],
  ["Admin Gudang", "Fase 7–8", "Web /admin/gudang"],
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
  const lightBg = rgb(0.95, 0.96, 0.97);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed) => {
    if (y - needed < BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawText = (text, { size, font, color, lineHeight = size * 1.35, x = MARGIN }) => {
    ensureSpace(lineHeight + 4);
    page.drawText(text, { x, y, size, font, color, maxWidth: PAGE_W - MARGIN * 2, lineHeight });
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
  drawText("MES HUMMER — DOKUMEN PENGUJIAN", { size: 20, font: bold, color: accent });
  drawText("Alur Produksi: Start Shift MAKER sampai Kemasan Karton", { size: 13, font: bold, color: ink });
  drawText("Versi 1.0 · 2 September 2026 · untuk Tim Testing", { size: 9, font: regular, color: gray });
  y -= 10;

  // --- Fase ---
  CONTENT.forEach((section, si) => {
    ensureSpace(60);
    drawText(`Fase ${si + 1} — ${section.title.replace(/^Fase \d+ — /, "")}`, { size: 11.5, font: bold, color: accent });
    section.items.forEach((item, ii) => {
      drawWrapped(`${si + 1}.${ii + 1}  ${item}`, { x: MARGIN + 4 });
    });
    y -= 6;
  });

  // --- Rantai data ---
  ensureSpace(70);
  drawText("Rantai Data End-to-End", { size: 11.5, font: bold, color: accent });
  drawWrapped(CHAIN.join("  ->  "), { size: 9.5, color: gray, lineHeight: 14 });
  y -= 6;

  // --- Aktor ---
  ensureSpace(110);
  drawText("Aktor & Peran", { size: 11.5, font: bold, color: accent });
  const colX = [MARGIN, 200, 330];
  const row = (cells, font = regular, bg = false) => {
    ensureSpace(18);
    if (bg) {
      page.drawRectangle({ x: MARGIN - 6, y: y - 3, width: PAGE_W - MARGIN * 2 + 12, height: 17, color: lightBg });
    }
    cells.forEach((c, i) => page.drawText(c, { x: colX[i], y, size: 9.5, font, color: ink }));
    y -= 18;
  };
  row(["Aktor", "Fase", "Perangkat"], bold, true);
  ACTORS.forEach((a) => row(a));

  // --- Footer page numbers ---
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`MES Hummer · Alur Produksi MAKER -> Karton · Halaman ${i + 1} dari ${pages.length}`, {
      x: MARGIN, y: 24, size: 7.5, font: regular, color: gray,
    });
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, await doc.save());
  console.log(`PDF dibuat: ${OUT} (${pages.length} halaman)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
