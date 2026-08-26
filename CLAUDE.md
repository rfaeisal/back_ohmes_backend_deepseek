# CLAUDE.md — Konteks untuk Claude Code

Proyek MES + WMS Hummer — **Fase 0–6 Complete** (Agustus 2026).

---

## Status Terkini

- ✅ 30+ halaman UI, 78+ API endpoint, 48 tabel DB
- ✅ Deploy Vercel + Neon PostgreSQL 16 (+ Coolify Docker: fix build selesai, migrasi manual)
- ✅ 13 test users (semua role ter-cover, password seragam 12345678 — lihat README)
- ✅ 8 boks TSG sample di inventory (REGULER, MILD, PUTIHAN)
- ✅ Roster mingguan + cetak bulanan
- ✅ Laporan TSG lengkap: masuk, stok, pakai, keluar (transfer antar pabrik + retur supplier)
- ✅ Material & sparepart: receiving, stok, pemakaian, keluar — dengan harga beli & rekap biaya
- ✅ Dokumen formal cetak: Berita Acara Serah Terima & Berita Acara Retur
- ✅ Handoff sisa TSG antar shift (bisa beda mesin)
- ✅ RBAC: permission enforcement di API + sidebar per role
- ✅ Dashboard per role: plant (grafik), area (hari/minggu, perbandingan antar pabrik, scope GLOBAL), HQ (grafik)
- ✅ Auth JWT + OTP 2 lapis + session management
- ✅ Sesi multi-boks (1–6): pilih boks TSG manual → timbang batangan kolektif (proporsional) → kode batch `btc_<mesin>_<tgl>_<seq>` untuk HLP
- ✅ Halaman HLP tablet (`/tablet/hlp`): pilih batch, catat packing, berat per batang
- ✅ Event level sesi: pemakaian/downtime/maintenance tanpa pilih boks
- ✅ Start shift hanya mesin MAKER (filter UI + validasi server)
- ✅ Surat Jalan Supplier v1.1 — pool label generik `TSG-YYYYMMDD-NNN` dicetak via web `/admin/supplier-sj` (PDF 100×75mm multi-halaman, XPrinter 420B), scan di gudang = assign + jenis + berat, VOID, validasi jumlah di pabrik
- ✅ Label pool v1.2 (26 Agu 2026): inisial R/M/P 43pt bold tanpa frame + kotak angka 1–5 + QR asli dari backend (bukan pseudo-QR) — lihat `pool-label-pdf.service.ts`
- ✅ FCM push live & terverifikasi end-to-end (firebase-admin, `fcm.service.ts`, trigger shift COMPLETED + receiving PENDING, token mati auto-bersih)
- ✅ Backlog fitur #1–5 selesai (26–27 Agu 2026, lihat TODO.md): pemakaian material per mesin (enum PEMAKAIAN + machine_id + applicable_machines MAKER/HLP/BOTH), maintenance & downtime level mesin (tabel machine_maintenance/machine_downtime + UI 🔧 di master-data), pemilih region area dashboard, auto-cleanup sesi (`src/instrumentation.ts` boot + 24 jam), dropdown field path corrections
- ✅ Model pack_qty di carton_content (migrasi 0019): karton diisi JUMLAH pack dari batch (bukan 1 batch utuh), validasi CARTON_FULL + PACK_INSUFFICIENT, UI "➕ Isi Pack" di gudang outbound
- ✅ Dokumen PDF murni: surat jalan dispatch resmi (kop + tabel boxed + 3 tanda tangan) + Berita Acara Serah Terima/Retur via `berita-acara-pdf.service.ts` (bukan halaman HTML + print)
- ✅ Semua testing E2E lokal tuntas (produksi→approval→area→HQ, HLP, gudang inbound, outbound, dispatch, transfer/retur) — lihat TODO.md
- ⚠️ Migrasi manual sampai **0019** (auto-apply entrypoint); dev DB di container `mes_dev_postgres` (port host 5433)

---

## Tech Stack (Wajib)

- Next.js 15 (App Router) · TypeScript strict · Drizzle ORM · PostgreSQL 16
- Tailwind CSS + Shadcn/UI (custom wrapper) + Lucide icons
- JWT auth (jose) + bcrypt · Zod validation
- Vitest · Playwright · GitHub Actions

---

## Konvensi Wajib

1. **TypeScript strict** — `any` = red flag
2. **Zod validation** di semua POST/PATCH boundary
3. **RLS** — semua tabel operasional wajib `plantId`
4. **API-first** — REST `/api/v1/*`, bukan Server Actions
5. **Kalkulasi server-side** — yield, berat/batang TIDAK di client
6. **Shift APPROVED = LOCKED** — perubahan via CORRECTION
7. **Audit log** — `writeAudit()` untuk semua mutasi
8. **Soft delete** — `deletedAt` di semua tabel
9. **Naming**: PascalCase doc/TS, snake_case SQL, camelCase field, dot.case permission
10. **Bahasa**: Indonesia untuk docs, Inggris/Indonesia bebas untuk komentar kode

---

## Struktur Proyek

```
src/
├── app/
│   ├── (tablet)/          # Tablet UI (7 halaman)
│   │   ├── login/         # Login → redirect by role
│   │   ├── shift/[id]/    # Shift aktif — produksi recording
│   │   ├── gudang/        # WMS Inbound
│   │   ├── start-shift/   # Mulai shift + roster auto-pick
│   │   └── labels/        # Cetak label standalone
│   ├── admin/             # Admin dashboard (14 halaman)
│   │   ├── roster/        # Roster mingguan + cetak bulanan
│   │   ├── reports/       # Laporan (tsg-receiving, tsg-stock, shifts)
│   │   └── sessions/      # Manajemen sesi
│   ├── api/v1/            # 60+ REST endpoints
│   └── print-labels/      # Print label standalone
├── components/ui/         # Button, Card, Badge, Input, Dialog (shadcn wrappers)
├── db/
│   ├── schema/            # 8 file Drizzle (30+ tabel)
│   ├── seed.ts            # Idempotent seed
│   └── migrations/        # SQL + RLS policies
├── lib/
│   ├── auth/              # JWT, session, scope-resolver, middleware
│   ├── calc/              # Yield, berat/batang, waste, OEE
│   ├── services/          # 13 service modules
│   ├── rls/               # PostgreSQL RLS context
│   └── utils/             # cn(), error format, pagination
└── middleware.ts           # CORS + rate limiting
```

---

## Business Rules Penting

- **TSG dari inventory**: operator wajib pilih dari inventory AVAILABLE (FIFO)
- **FIFO override**: perlu permission + audit alasan
- **Ganti produk mid-shift**: TIDAK DIIZINKAN — harus end shift + start baru
- **Shift handoff**: boks aktif wajib timbang saat end shift
- **SUPERADMIN**: max 3, JWT 5 menit, 2FA, OTP bypass `OTP_BYPASS_CODE`
- **Single-session mobile**: 409 SESSION_EXISTS, revoke via SUPERADMIN
- **Token expired**: 401 redirect hanya untuk POST/PATCH (bukan GET background)

---

## Known Issues & Gotchas

1. **Drizzle `db.execute()`** — pakai type cast untuk raw SQL: `::uuid`, `::date`
2. **Shadcn CSS** — pastikan `--primary`, `--secondary` dalam HSL di `globals.css`
3. **`useSearchParams()`** — wajib dibungkus `<Suspense>`
4. **Roster shiftRoleId** — harus UUID, bukan string "ketua_kecer"
5. **Next.js fetch cache** — tambah `cache: "no-store"` + `_t=Date.now()` untuk client fetch
6. **Print CSS** — `print-color-adjust: exact` agar warna tetap muncul
7. **Admin layout** — ada auth guard (`useEffect` cek token, redirect `/tablet/login`)
8. **Jangan `pnpm build` saat dev server jalan** — `.next` dipakai bersama; build menimpa state dev → MODULE_NOT_FOUND / UI rusak (tombol disabled). Fix: matikan dev → `rm -rf .next` → `pnpm dev` ulang
9. **Migrasi manual di luar journal drizzle** — dulu wajib apply manual via psql. **Sekarang otomatis**: entrypoint container panggil `scripts/apply-manual-migrations.mjs` setelah `drizzle-kit migrate`, jalankan semua `.sql` di `src/db/migrations/` yang tidak ada di `_journal.json`. Syarat: file wajib idempotent (`IF NOT EXISTS`, `OR REPLACE`) karena di-run setiap deploy. ⚠️ **`ALTER TYPE ... ADD VALUE` TIDAK boleh di file multi-statement** — script mengeksekusi tiap file dalam satu batch (implicit transaction) → error `check_safe_enum_use`. Taruh di file terpisah berisi SATU statement (lihat migrasi 0016 vs 0017)
10. **RLS aktif via role `mes_app`** (migrasi 0008, non-superuser). `DATABASE_URL` = runtime (mes_app), `DATABASE_URL_ADMIN` = superuser untuk drizzle-kit & seed. Jangan ganti DATABASE_URL ke role superuser/owner — RLS mati lagi. Seed pakai `pnpm db:seed*` (wrapper run-seed*.ts, otomatis pakai URL admin). Script tsx TIDAK memuat `.env` — `set -a; source .env` dulu kalau dipanggil langsung. ⚠️ Kalau tes RLS lewat script manual, format setting-nya array: `set_config('app.current_plant_ids', '{uuid1,uuid2}', false)`
11. **Drizzle subquery ter-korelasi di SELECT list** — `${kolom}` di dalam `sql\`...\`` di-render sebagai nama kolom TELANJANG (`"id"`) yang resolve ke tabel INNER, bukan outer → hasil selalu 0/salah. Tulis literal nama tabel: `WHERE cc.carton_id = "carton"."id"`. Lihat contoh di `cartons/route.ts` dan `hlp/packs/route.ts`.
12. **Timezone** — `report_date` disimpan sebagai tanggal WIB. Hitung "hari ini" pakai `new Date(Date.now() + 7*3600000)` lalu `toISOString().slice(0,10)`, bukan UTC mentah (bug pernah terjadi di admin home).
13. **zod datetime** — default `.datetime()` tolak offset +07:00; pakai `.datetime({ offset: true })`. Input `datetime-local` dari browser harus dikonversi `new Date(v).toISOString()` sebelum dikirim.
14. **Dokumen PDF** — pola resmi: service pdf-lib (`berita-acara-pdf.service.ts`, surat jalan di `dispatch/documents/[docNumber]/download/route.ts`) + buka via `fetch` blob + `window.open(URL.createObjectURL(blob))` (bukan halaman HTML + window.print — sidebar admin ikut tercetak).

---

## Setup Cepat

```bash
docker compose -f docker-compose.dev.yml up -d  # PostgreSQL
cp .env.example .env
pnpm install && pnpm db:migrate && pnpm db:seed
pnpm seed:superadmin --username admin --email admin@hummer.example
pnpm dev  # → http://localhost:3001
```
