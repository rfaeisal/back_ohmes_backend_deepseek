// =============================================================================
// Generate PDF "Spesifikasi Teknis & Fitur Aplikasi — Acuan RAB"
//
// Pemakaian:  node scripts/generate-rab-spec-pdf.mjs
// Output:     docs/spesifikasi-teknis-acuan-rab.pdf
// Catatan: font standar Helvetica (WinAnsi) — teks tidak boleh memuat
// karakter di luar Latin-1 (-> pengganti panah, x pengganti ×).
// =============================================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "spesifikasi-teknis-acuan-rab.pdf");

const SECTIONS = [
  {
    title: "1. Ringkasan Eksekutif",
    items: [
      "Aplikasi MES + WMS \"Hummer\" untuk manufaktur rokok: mencatat produksi dari start shift mesin MAKER, proses TSG (tembakau siap giling), HLP (packing batangan), rantai WR-SLOP-BAL, karton, dispatch, hingga laporan manajemen multi-plant.",
      "Skala saat ini: 66 tabel PostgreSQL, 133 file route API (REST /api/v1), 43 halaman UI, 14 role dengan 72 permission, 25 modul service, 34 migrasi DB, 10 spec E2E, CI/CD GitHub Actions 5 job.",
      "Dua aplikasi klien: (1) Web + Tablet (Next.js 15), (2) Mobile Android/iOS (Flutter, repo terpisah) dengan FCM push dan deep-link.",
      "Status: Fase 0-6 selesai, live di produksi (Vercel + Neon PostgreSQL + Coolify Docker). Sisa: checklist go-live lapangan dan pengembangan aspirasional.",
    ],
  },
  {
    title: "2. Arsitektur Sistem",
    items: [
      "Klien: Web admin (Next.js App Router), Tablet lantai produksi (web responsive), Mobile app (Flutter, REST + FCM).",
      "Backend: REST API /api/v1 (API-first, bukan Server Actions) -> layer service (25 modul) -> Drizzle ORM -> PostgreSQL 16.",
      "Keamanan berlapis: JWT (jose) + OTP 2 lapis + RBAC (middleware tiap route) + Row Level Security PostgreSQL per plant.",
      "Kalkulasi bisnis 100% server-side (yield, berat/batang, pembagian proporsional, OEE).",
      "Background: instrumentation auto-cleanup sesi (24 jam), push FCM fire-and-forget, soft delete + audit log semua mutasi.",
    ],
  },
  {
    title: "3. Tech Stack & Versi",
    items: [
      "Runtime: Node.js >= 22 · Package manager: pnpm 11.5.",
      "Framework: Next.js 15.5 (App Router) · React 19 · TypeScript strict.",
      "Database: PostgreSQL 16 + Drizzle ORM 0.45 · driver postgres 3.",
      "Auth: jose 5 (JWT) + bcrypt 5 · validasi input: Zod 3.",
      "UI: Tailwind CSS + shadcn (wrapper custom) + lucide-react · base-ui.",
      "Dokumen: pdf-lib 1.17 (surat jalan, berita acara, label) · QR: qrcode 1.5.",
      "Push: firebase-admin 14 (FCM) · ID: nanoid 5.",
      "Testing: Vitest (unit + integrasi) + Playwright (E2E) · CI: GitHub Actions.",
    ],
  },
  {
    title: "4. Infrastruktur & Layanan Pihak Ketiga",
    items: [
      "Hosting aplikasi: Vercel (utama) dan Coolify + Docker (jalur deploy kedua) — keduanya aktif.",
      "Database: Neon PostgreSQL 16 (cloud) + container PostgreSQL dev/QA lokal.",
      "Firebase Cloud Messaging (project \"back-ohmes\") — push notifikasi mobile.",
      "GitHub: repositori + CI/CD (lint, test, build, security audit, E2E).",
      "Domain + TLS: produksi (koordinasi kontrak API dengan tim mobile — domain dan error-envelope TIDAK boleh diubah sepihak).",
      "Catatan RAB: komponen berbiaya = hosting Vercel (plan sesuai traffic), Neon DB, server Coolify (VM), Firebase (level gratis cukup untuk volume notifikasi kecil-menengah), domain tahunan.",
    ],
  },
  {
    title: "5. Inventori Fitur per Modul",
    items: [
      "Auth & Sesi: login JWT + OTP 2 lapis, SUPERADMIN 2FA (maks 3 akun, token 5 menit), single-session mobile (409 SESSION_EXISTS + revoke), TTL token per role, switch scope, session management.",
      "RBAC: 14 role (SUPERADMIN, HQ_ADMIN, HQ_ANALYST, HQ_AUDITOR, AREA_COORDINATOR, AREA_QA, AREA_SJ_OFFICER, PLANT_MANAGER, SHIFT_SUPERVISOR, GUDANG_INBOUND, GUDANG_OUTBOUND, EKSPEDISI, OPERATOR_KECER, OPERATOR_MEMBER) + 72 permission; enforcement di API dan sidebar per role.",
      "Master Data: mesin (MAKER/HLP/WR/SLOP/BAL + machine template range yield), plant/region/company, produk, consumable & sparepart dengan applicable_machines, user + assignment.",
      "Produksi MAKER (tablet): start shift (roster auto-pick, validasi mesin MAKER saja), buka sesi 1-6 boks TSG dari inventory FIFO (override ber-permission + audit), timbang batangan kolektif proporsional, yield server-side, batch btc_<mesin>_<tgl>_<seq>, event konsumsi/downtime/maintenance per boks-sesi, waste 4 kategori wajib (MENIR/RIJEKAN/DEBU_KASAR/DEBU_HALUS), handoff sisa TSG antar shift (boleh beda mesin), end shift -> COMPLETED + FCM, approve -> LOCKED + CORRECTION + reopen.",
      "HLP (tablet): sesi HLP (auto-tutup idle 6 jam), catat packing per batch (1 batch 1 kali; total batang & berat/batang server-side), reject pack = batangan + alasan, ambang reject 5% -> push FCM, ledger rijekan 2 satuan, input operasional (material PEMAKAIAN/WASTE, downtime, maintenance mesin), rantai produksi WR -> SLOP -> BAL (batch_stage_event, mesin opsional/manual, stage otomatis ke tertinggi) + ringkasan sisa per stage.",
      "WMS Inbound: receiving TSG manual + via Surat Jalan Supplier, pool label QR (scan -> assign + jenis + berat, VOID, validasi jumlah di pabrik), reject receiving, transfer antar pabrik, retur supplier, inventory FIFO per plant.",
      "WMS Outbound: karton (kapasitas pack, validasi CARTON_FULL & PACK_INSUFFICIENT), isi pack dari batch, closeCarton, finished goods receiving (ekspektasi vs aktual dari approve).",
      "Dispatch & Dokumen: surat jalan dispatch PDF resmi (kop + tabel + 3 tanda tangan), Berita Acara Serah Terima & Retur PDF, dokumen material-out.",
      "Makloon: penerimaan batangan external (batch btx_, source EXTERNAL) + approval/reject, entry stage (BATANGAN/PACK/PACK_WRAPPED/SLOP/BAL), keluar ke customer dengan exit stage, PDF serah terima.",
      "Laporan & Dashboard: laporan TSG lengkap (masuk, stok, pakai, keluar), rekap biaya material & sparepart, laporan rijekan, dashboard per role (plant grafik / area harian-mingguan + perbandingan antar pabrik + region picker / HQ grafik), KPI.",
      "Label & Cetak: label pool 100x75mm multi-halaman (inisial 43pt + kotak angka + QR asli backend), cetak label standalone, cetak roster bulanan, surat jalan supplier.",
      "Notifikasi FCM: shift COMPLETED (PM + supervisor), receiving PENDING, reject HLP tinggi, batangan external PENDING; payload data untuk deep-link mobile (type + id rute); token mati auto-bersih.",
    ],
  },
  {
    title: "6. Basis Data",
    items: [
      "66 tabel PostgreSQL 16, 34 migrasi (journal drizzle + migrasi manual idempotent yang auto-apply tiap deploy).",
      "Row Level Security aktif via role mes_app (non-superuser) — semua tabel operasional wajib plantId.",
      "Konvensi: soft delete (deletedAt), audit log semua mutasi, idempotency key untuk operasi idempotent.",
      "Seed idempotent + sync permission-role additive (grant permission baru sampai ke produksi tanpa migrasi).",
    ],
  },
  {
    title: "7. Keamanan",
    items: [
      "Autentikasi 2 lapis (password + OTP), 2FA SUPERADMIN, OTP bypass terkontrol.",
      "Otorisasi ganda: RBAC middleware tiap route + RLS PostgreSQL (pertahanan berlapis).",
      "Rate limiting per path (middleware), CORS ketat.",
      "Audit trail seluruh mutasi (who, what, when, before/after).",
      "Sesi: revoke paksa, single-session mobile, TTL per role (lantai produksi 8 jam).",
      "API error-envelope standar + requestId (koordinasi kontrak mobile).",
    ],
  },
  {
    title: "8. Perangkat Lapangan & Integrasi",
    items: [
      "Tablet produksi: web responsive (/tablet — start-shift, shift aktif, HLP, gudang, label).",
      "Mobile app (Flutter): login, approve shift, receiving, dashboard, FCM push + deep-link.",
      "Printer label: XPrinter 420B (label 100x75mm, PDF multi-halaman).",
      "QR: label asli dari backend (qrcode), scan via kamera tablet/HP.",
    ],
  },
  {
    title: "9. Pengujian & Kualitas",
    items: [
      "Unit test: 122 · Integrasi: 22 · E2E Playwright: 10 spec rantai bisnis penuh (produksi -> approval -> area -> HQ, HLP, gudang inbound/outbound, dispatch, transfer/retur).",
      "CI GitHub Actions 5 job: lint, test, build, security audit, E2E (reset DB + build + server dedicated tiap run).",
      "Audit dependency rutin (1 vuln sedang ditoleransi: uuid transitif firebase-admin).",
      "Coverage line 9% (target aspirasional 80%).",
    ],
  },
  {
    title: "10. Operasional",
    items: [
      "Deploy: Vercel + Coolify (entrypoint otomatis: migrate + migrasi manual + build).",
      "Backup & recovery: pg_dump runbook, dokumen runbook operasional (docs/17, docs/18).",
      "Auto-cleanup: sesi produksi 24 jam (instrumentation).",
      "Utilitas: reset data transaksi (scripts/reset-transactions.sql), test push FCM (scripts/fcm-test-push.mjs), generator dokumen PDF.",
    ],
  },
  {
    title: "11. Catatan untuk Penyusunan RAB",
    items: [
      "Biaya berulang (bulanan/tahunan): hosting Vercel, Neon PostgreSQL, VM Coolify, domain + TLS, Firebase (perkiraan gratis - kecil).",
      "Perangkat per pabrik: tablet lantai produksi, HP Android operator/approver, printer label XPrinter 420B, koneksi internet.",
      "Pengembangan tersisa (estimasi): checklist go-live lapangan (re-login user, verifikasi FCM natural, checklist manual), coverage test aspirasional 80%, halaman mobile baru bila diminta (external receiving, batch detail), peringatan selisih stage (docs/25 - belum diimplementasikan).",
      "Dukungan & maintenance: pemeliharaan rutin, monitoring deploy, koordinasi kontrak API dengan tim mobile.",
      "Dokumentasi tersedia: PRD (docs/01), API spec (docs/06), RBAC matrix (docs/05), runbook operasional (docs/17), deploy Coolify (docs/deploy-coolify-runbook.md), PDF alur produksi dan skenario pengujian HLP.",
    ],
  },
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
  drawText("MES HUMMER — SPESIFIKASI TEKNIS & FITUR APLIKASI", { size: 17, font: bold, color: accent });
  drawText("Dokumen Acuan Penyusunan RAB (Rencana Anggaran Biaya)", { size: 12, font: bold, color: ink });
  drawText("Versi 1.0 · 2 September 2026 · Angka terverifikasi dari kode & database produksi", { size: 9, font: regular, color: gray });
  y -= 10;

  SECTIONS.forEach((section) => {
    ensureSpace(52);
    drawText(section.title, { size: 11.5, font: bold, color: accent });
    section.items.forEach((item) => {
      drawWrapped("-  " + item, { x: MARGIN + 4 });
    });
    y -= 6;
  });

  // --- Footer page numbers ---
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`MES Hummer · Spesifikasi Teknis Acuan RAB · Halaman ${i + 1} dari ${pages.length}`, {
      x: MARGIN, y: 24, size: 7.5, font: regular, color: gray,
    });
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, await doc.save());
  console.log(`PDF dibuat: ${OUT} (${pages.length} halaman)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
