# CLAUDE.md — Konteks untuk Claude Code

Proyek MES + WMS Hummer — **Fase 0–6 Complete** (Agustus 2026).

---

## Status Terkini

- ✅ 30+ halaman UI, 75+ API endpoint, 46 tabel DB
- ✅ Deploy Vercel + Neon PostgreSQL 16
- ✅ 13 test users (semua role ter-cover, password seragam 12345678 — lihat README)
- ✅ 8 boks TSG sample di inventory (REGULER, MILD, PUTIHAN)
- ✅ Roster mingguan + cetak bulanan
- ✅ Laporan TSG lengkap: masuk, stok, pakai, keluar (transfer antar pabrik + retur supplier)
- ✅ Material & sparepart: receiving, stok, pemakaian, keluar — dengan harga beli & rekap biaya
- ✅ Dokumen formal cetak: Berita Acara Serah Terima & Berita Acara Retur
- ✅ Handoff sisa TSG antar shift (bisa beda mesin)
- ✅ RBAC: permission enforcement di API + sidebar per role
- ✅ Dashboard per role: plant (grafik), area (hari/minggu), HQ (grafik)
- ✅ Auth JWT + OTP 2 lapis + session management

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

---

## Setup Cepat

```bash
docker compose -f docker-compose.dev.yml up -d  # PostgreSQL
cp .env.example .env
pnpm install && pnpm db:migrate && pnpm db:seed
pnpm seed:superadmin --username admin --email admin@hummer.example
pnpm dev  # → http://localhost:3001
```
