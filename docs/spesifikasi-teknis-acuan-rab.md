# MES Hummer — Spesifikasi Teknis & Fitur Aplikasi

> **Dokumen Acuan Penyusunan RAB (Rencana Anggaran Biaya)**
> Versi 1.0 · 2 September 2026 · Angka terverifikasi dari kode & database produksi
> Pendamping: [`rab-mobile-draft.md`](./rab-mobile-draft.md) (bagian mobile, diisi tim mobile)

---

## 1. Ringkasan Eksekutif

Aplikasi **MES + WMS "Hummer"** untuk **manufaktur rokok**: mencatat produksi dari start shift mesin MAKER, proses **TSG (tembakau siap giling)**, HLP (packing batangan), rantai WR → SLOP → BAL, karton, dispatch, hingga laporan manajemen multi-plant.

Skala saat ini:

| Aspek | Angka |
|---|---|
| Tabel PostgreSQL | 66 |
| File route API (REST `/api/v1`) | 133 |
| Halaman UI (web admin + tablet) | 43 |
| Role / Permission | 14 / 72 |
| Modul service | 25 |
| Migrasi DB | 34 |
| Spec E2E Playwright | 10 |
| CI/CD GitHub Actions | 5 job |

Dua aplikasi klien:
1. **Web + Tablet** — Next.js 15 (admin dashboard + tablet lantai produksi)
2. **Mobile** — Flutter (Android/iOS, repo terpisah) dengan FCM push + deep-link

Status: **Fase 0–6 selesai, live di produksi** (Vercel + Neon PostgreSQL + Coolify Docker). Sisa: checklist go-live lapangan dan pengembangan aspirasional.

---

## 2. Arsitektur Sistem

```
Web Admin (Next.js App Router)
Tablet Produksi (web responsive)          Mobile App (Flutter)
        │                                        │
        └──────────────┬─────────────────────────┘
                       ▼
        REST API /api/v1  (API-first, bukan Server Actions)
                       │
                       ▼
        Service layer (25 modul)  — semua kalkulasi bisnis server-side
                       │
                       ▼
        Drizzle ORM ── PostgreSQL 16 (RLS per plant)
                       │
                       ▼
        FCM Push (firebase-admin)  ·  Audit log  ·  Soft delete
```

- **Kalkulasi bisnis 100% server-side**: yield, berat/batang, pembagian proporsional, OEE.
- **Keamanan berlapis**: JWT (jose) + OTP 2 lapis + RBAC middleware tiap route + Row Level Security PostgreSQL.
- **Background**: auto-cleanup sesi 24 jam (instrumentation), push FCM fire-and-forget.

---

## 3. Tech Stack & Versi

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js ≥ 22 · pnpm 11.5 |
| Framework | Next.js 15.5 (App Router) · React 19 · TypeScript strict |
| Database | PostgreSQL 16 + Drizzle ORM 0.45 · driver postgres 3 |
| Auth | jose 5 (JWT) + bcrypt 5 |
| Validasi input | Zod 3 |
| UI | Tailwind CSS + shadcn (wrapper custom) + lucide-react + base-ui |
| Dokumen PDF | pdf-lib 1.17 (surat jalan, berita acara, label) |
| QR | qrcode 1.5 (QR asli dari backend) |
| Push | firebase-admin 14 (FCM) |
| Testing | Vitest (unit + integrasi) + Playwright (E2E) |
| CI/CD | GitHub Actions (5 job) |

---

## 4. Infrastruktur & Layanan Pihak Ketiga

| Layanan | Pemakaian | Catatan biaya RAB |
|---|---|---|
| Vercel | Hosting aplikasi (utama) | plan sesuai traffic |
| Coolify + Docker | Jalur deploy kedua (aktif) | VM server |
| Neon PostgreSQL 16 | Database produksi (cloud) | plan sesuai kapasitas |
| Firebase (project `back-ohmes`) | FCM push notifikasi | gratis–kecil untuk volume menengah |
| GitHub | Repositori + CI/CD | organisasi/private repo |
| Domain + TLS | Produksi | tahunan; **kontrak API/domain tidak boleh diubah sepihak** (koordinasi tim mobile) |

---

## 5. Inventori Fitur per Modul

### Auth & Sesi
- Login JWT + OTP 2 lapis
- SUPERADMIN: maks 3 akun, 2FA wajib, token 5 menit, OTP bypass terkontrol
- Single-session mobile (409 `SESSION_EXISTS` + revoke paksa)
- TTL token per role (lantai produksi 8 jam), switch scope multi-plant

### RBAC
- **14 role**: SUPERADMIN, HQ_ADMIN, HQ_ANALYST, HQ_AUDITOR, AREA_COORDINATOR, AREA_QA, AREA_SJ_OFFICER, PLANT_MANAGER, SHIFT_SUPERVISOR, GUDANG_INBOUND, GUDANG_OUTBOUND, EKSPEDISI, OPERATOR_KECER, OPERATOR_MEMBER
- **72 permission** — enforcement di API + sidebar per role

### Master Data
- Mesin: MAKER / HLP / WR / SLOP / BAL + machine template (range yield)
- Plant / region / company, produk
- Consumable & sparepart dengan `applicable_machines`
- User + assignment + scope

### Produksi MAKER (tablet)
- Start shift: roster auto-pick, validasi mesin MAKER saja
- Buka sesi 1–6 boks TSG dari inventory (FIFO; override ber-permission + audit)
- Timbang batangan kolektif → pembagian proporsional → yield server-side
- Batch `btc_<mesin>_<tgl>_<seq>`
- Event per boks/sesi: konsumsi, downtime, maintenance
- Waste 4 kategori wajib: MENIR, RIJEKAN, DEBU_KASAR, DEBU_HALUS
- Handoff sisa TSG antar shift (boleh beda mesin)
- End shift → COMPLETED + FCM; approve → LOCKED + CORRECTION + reopen

### HLP (tablet)
- Sesi HLP (auto-tutup idle 6 jam)
- Catat packing per batch (1 batch 1 kali; total batang & berat/batang server-side)
- Reject pack = batangan + alasan; ambang reject 5% → push FCM
- Ledger rijekan 2 satuan + laporan web
- Input operasional: material PEMAKAIAN/WASTE, downtime, maintenance mesin
- Rantai produksi WR → SLOP → BAL (`batch_stage_event`, mesin opsional/manual, stage otomatis ke tertinggi) + ringkasan sisa per stage

### WMS Inbound
- Receiving TSG manual + via Surat Jalan Supplier
- Pool label QR (scan → assign + jenis + berat, VOID, validasi jumlah di pabrik)
- Reject receiving, transfer antar pabrik, retur supplier
- Inventory FIFO per plant

### WMS Outbound
- Karton dengan kapasitas pack — validasi `CARTON_FULL` & `PACK_INSUFFICIENT`
- Isi pack dari batch, closeCarton
- Finished goods receiving (ekspektasi vs aktual dari approve)

### Dispatch & Dokumen
- Surat jalan dispatch PDF resmi (kop + tabel + 3 tanda tangan)
- Berita Acara Serah Terima & Retur PDF
- Dokumen material-out

### Makloon
- Penerimaan batangan external (batch `btx_`, source EXTERNAL) + approval/reject
- Entry stage: BATANGAN / PACK / PACK_WRAPPED / SLOP / BAL
- Keluar ke customer dengan exit stage + PDF serah terima

### Laporan & Dashboard
- Laporan TSG lengkap: masuk, stok, pakai, keluar
- Rekap biaya material & sparepart, laporan rijekan
- Dashboard per role: plant (grafik), area (hari/minggu + perbandingan antar pabrik + region picker), HQ (grafik), KPI

### Label & Cetak
- Label pool 100×75 mm multi-halaman (inisial 43pt + kotak angka + QR asli backend)
- Cetak label standalone, cetak roster bulanan, surat jalan supplier

### Notifikasi FCM
- Shift COMPLETED (PM + supervisor), receiving PENDING, reject HLP tinggi, batangan external PENDING
- Payload data untuk deep-link mobile (`type` + id rute), token mati auto-bersih

---

## 6. Basis Data

- 66 tabel PostgreSQL 16 · 34 migrasi (journal drizzle + migrasi manual idempotent auto-apply tiap deploy)
- Row Level Security aktif via role `mes_app` (non-superuser) — semua tabel operasional wajib `plantId`
- Konvensi: soft delete (`deletedAt`), audit log semua mutasi, idempotency key
- Seed idempotent + sync role→permission additive (grant baru sampai produksi tanpa migrasi)

---

## 7. Keamanan

| Lapisan | Implementasi |
|---|---|
| Autentikasi | Password + OTP (2 lapis), 2FA SUPERADMIN |
| Otorisasi ganda | RBAC middleware tiap route + RLS PostgreSQL |
| Rate limiting | Middleware per path |
| Audit | Seluruh mutasi (who/what/when/before/after) |
| Sesi | Revoke paksa, single-session mobile, TTL per role |
| API | Error-envelope standar + requestId |

---

## 8. Perangkat Lapangan & Integrasi

| Perangkat | Peran |
|---|---|
| Tablet produksi | Web responsive (`/tablet`: start-shift, shift aktif, HLP, gudang, label) |
| HP Android | Mobile app Flutter: login, approve, receiving, dashboard, FCM + deep-link |
| Printer label | XPrinter 420B — label 100×75 mm, PDF multi-halaman |
| QR | Label asli dari backend (qrcode), scan via kamera tablet/HP |

---

## 9. Pengujian & Kualitas

- Unit test: **122** · Integrasi: **22** · E2E Playwright: **10 spec** rantai bisnis penuh
- CI GitHub Actions 5 job: lint, test, build, security audit, E2E (reset DB + build + server dedicated tiap run)
- Audit dependency rutin (1 vuln sedang ditoleransi: uuid transitif firebase-admin)
- Coverage line 9% (target aspirasional 80%)

---

## 10. Operasional

- Deploy: Vercel + Coolify (entrypoint otomatis: migrate + migrasi manual + build)
- Backup & recovery: pg_dump runbook (`docs/17`, `docs/18`)
- Auto-cleanup: sesi produksi 24 jam (instrumentation)
- Utilitas: `scripts/reset-transactions.sql` (reset data transaksi), `scripts/fcm-test-push.mjs` (test push), generator dokumen PDF

---

## 11. Catatan untuk Penyusunan RAB

### Biaya berulang (bulanan/tahunan)
- Hosting Vercel · Neon PostgreSQL · VM Coolify · domain + TLS · Firebase (perkiraan gratis–kecil)

### Perangkat per pabrik
- Tablet lantai produksi · HP Android operator/approver · printer label XPrinter 420B · koneksi internet

### Pengembangan tersisa
- Checklist go-live lapangan (re-login user, verifikasi FCM natural, checklist manual)
- Coverage test aspirasional 80%
- Halaman mobile baru bila diminta: external receiving, detail batch
- Peringatan selisih stage (docs/25 — belum diimplementasikan)

### Dukungan & maintenance
- Pemeliharaan rutin, monitoring deploy, koordinasi kontrak API dengan tim mobile

### Dokumentasi tersedia
- PRD (`docs/01`), API spec (`docs/06`), RBAC matrix (`docs/05`), runbook operasional (`docs/17`), deploy Coolify (`docs/deploy-coolify-runbook.md`)
- PDF alur produksi (`docs/alur-produksi-maker-ke-karton.pdf`) dan skenario pengujian HLP (`docs/skenario-pengujian-hlp.pdf`)
