# back_ohmes_backend — MES + WMS Hummer

Sistem terintegrasi **Manufacturing Execution System (MES) + Warehouse Management System (WMS)** untuk operasi pabrik rokok multi-cabang. Produk utama: **Hummer**. Target skala: 30+ pabrik heterogen dengan hirarki `Kantor Pusat → Koordinator Area → Pabrik`.

**Status**: ✅ **Fase 0–6 Complete** · 22 halaman UI · 60+ API endpoint · 43 tabel database · Deploy Vercel + Neon PostgreSQL 16

---

## Cakupan Sistem

1. **Terima TSG dari supplier** (WMS Inbound) ✅
2. **Simpan TSG di gudang** dengan inventory FIFO ✅
3. **Produksi** (Maker + HLP + shift) ✅
4. **Simpan barang jadi** + cartoning traceability (WMS Outbound) ✅
5. **Distribusi basic** dengan surat jalan PDF (Dispatch) ✅

Plus: QR labels, roster mingguan, laporan stok, laporan receiving, KPI dashboard, analitik OEE

---

## Tech Stack

| Layer | Stack |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Route Handlers) |
| Language | TypeScript 5.x strict |
| Database | PostgreSQL 16 (Neon / local Docker) |
| ORM | Drizzle ORM |
| Auth | JWT + refresh token (2FA SUPERADMIN, OTP bypass) |
| UI | Tailwind CSS + Shadcn/UI + Lucide icons |
| Mobile | Flutter 3.16+ (API ready, app TBD) |
| Deployment | Vercel (prod) + Local (dev) |
| CI/CD | GitHub Actions |

---

## Quick Start — Local Dev

```bash
# 1. Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# 2. Setup env
cp .env.example .env

# 3. Install & run
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm seed:superadmin --username admin --email admin@hummer.example

# 4. Start dev server
pnpm dev
# → http://localhost:3001
```

Login: admin / (password dari output seed-superadmin) / OTP `000000`

---

## Halaman UI (22 pages)

| Halaman | URL | Role |
|---|---|---|
| **Tablet Operator** | `/tablet` | OPERATOR_KECER |
| Start Shift | `/tablet/start-shift` | OPERATOR_KECER |
| Shift Aktif (produksi) | `/tablet/shift/[id]` | OPERATOR_KECER |
| Gudang Inbound | `/tablet/gudang` | GUDANG_INBOUND |
| Dashboard KPI | `/tablet/dashboard` | Semua |
| Cetak Label | `/tablet/labels` | GUDANG_INBOUND |
| **Admin Dashboard** | `/admin` | SUPERADMIN/HQ |
| Approval Shift | `/admin/approvals` | SHIFT_SUPERVISOR |
| Dashboard Area | `/admin/area-dashboard` | AREA_COORDINATOR |
| HQ Analytics | `/admin/analytics` | HQ_ANALYST |
| CORRECTION | `/admin/corrections` | HQ_AUDITOR |
| Users & Roles | `/admin/users` | HQ_ADMIN |
| Master Data | `/admin/master-data` | HQ_ADMIN |
| Audit Log | `/admin/audit` | SUPERADMIN |
| Laporan TSG Masuk | `/admin/reports/tsg-receiving` | Admin |
| Laporan Stok TSG | `/admin/reports/tsg-stock` | Admin |
| Laporan Per Shift | `/admin/reports/shifts` | Admin |
| Roster Mingguan | `/admin/roster` | Admin |
| Cetak Bulanan | `/admin/roster/print` | Admin |
| Manajemen Sesi | `/admin/sessions` | SUPERADMIN |
| SUPERADMIN Tools | `/admin/super` | SUPERADMIN |

---

## Test Users

| Username | Password | Role |
|---|---|---|
| admin | (seed output) | SUPERADMIN |
| kecer | 12345678 | OPERATOR_KECER |
| anggotatim | 12345678 | OPERATOR_MEMBER |
| supervisor | 12345678 | SHIFT_SUPERVISOR |
| gudangin | 12345678 | GUDANG_INBOUND |
| gudangout | 12345678 | GUDANG_OUTBOUND |
| ekspedisi | 12345678 | EKSPEDISI |
| plantmanager | 12345678 | PLANT_MANAGER |
| areaqa | 12345678 | AREA_QA |
| area.koordinator | 12345678 | AREA_COORDINATOR |
| hqadmin | 12345678 | HQ_ADMIN |
| hqanalyst | 12345678 | HQ_ANALYST |
| hqauditor | 12345678 | HQ_AUDITOR |

---

## Deploy — Vercel + Neon

1. Provision PostgreSQL 16 di Neon (neon.tech)
2. Deploy repo ke Vercel — auto-detect Next.js
3. Environment variables: `DATABASE_URL`, `JWT_SECRET`, `OTP_BYPASS_CODE`, `HMAC_KEY_ENCRYPTION`
4. Post-deploy: `pnpm deploy:setup` (migrate + seed)
5. Seed SUPERADMIN via CLI

---

## Referensi

- [`CLAUDE.md`](./CLAUDE.md) — konteks untuk LLM assistant
- [`SETUP.md`](./SETUP.md) — setup detail
- [`docs/README.md`](./docs/README.md) — indeks dokumentasi
- [`docs/test-scenarios.html`](./docs/test-scenarios.html) — skenario test
