# back_ohmes_backend — MES + WMS Hummer

Sistem terintegrasi **Manufacturing Execution System (MES) + Warehouse Management System (WMS)** untuk operasi pabrik rokok multi-cabang. Produk utama: **Hummer**. Target skala: 30+ pabrik heterogen dengan hirarki `Kantor Pusat → Koordinator Area → Pabrik`.

**Status**: ✅ **Fase 0–6 Complete** · 30+ halaman UI · 75+ API endpoint · 46 tabel database · Deploy Vercel + Neon PostgreSQL 16

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

## Halaman UI (30+ pages)

### Tablet Operator
| Halaman | URL | Role |
|---|---|---|
| Tablet Operator (lantai produksi) | `/tablet` | OPERATOR_KECER |
| Start Shift (+ pilih handoff) | `/tablet/start-shift` | OPERATOR_KECER |
| Shift Aktif (produksi, handoff, material) | `/tablet/shift/[id]` | OPERATOR_KECER |
| Dashboard KPI Pabrik | `/tablet/dashboard` | Operator |
| Login (OTP 2 lapis untuk SUPERADMIN) | `/tablet/login` | Semua |

### Admin — Operasional
| Halaman | URL | Role |
|---|---|---|
| Admin Dashboard (grafik) | `/admin` | Semua admin |
| Approval Shift (pending + approved) | `/admin/approvals` | SHIFT_SUPERVISOR |
| Dashboard Pabrik | `/admin/plant-dashboard` | PLANT_MANAGER |
| Gudang Inbound (TSG + material + retur + transfer) | `/admin/gudang` | GUDANG_INBOUND |
| Gudang Outbound (FG + kartoning) | `/admin/gudang-outbound` | GUDANG_OUTBOUND |
| Dispatch Order | `/admin/dispatch` | EKSPEDISI |
| Roster Mingguan + Cetak | `/admin/roster` | Supervisor |
| Cetak Label | `/admin/labels` | Gudang |

### Admin — Dashboard & Laporan
| Halaman | URL | Role |
|---|---|---|
| Dashboard Area (hari/minggu + grafik) | `/admin/area-dashboard` | AREA_COORDINATOR/QA |
| HQ Analytics (periode + grafik) | `/admin/analytics` | HQ_ANALYST |
| Laporan Per Shift | `/admin/reports/shifts` | shift.view |
| Penggunaan TSG | `/admin/reports/tsg-usage` | shift.view |
| Stok TSG | `/admin/reports/tsg-stock` | tsg.inventory.view |
| Laporan TSG Masuk | `/admin/reports/tsg-receiving` | tsg.receiving.view |
| TSG Keluar (transfer + retur) | `/admin/reports/tsg-out` | tsg.inventory.view |
| Stok Material | `/admin/reports/material-stock` | tsg.inventory.view |
| Material Masuk | `/admin/reports/material-receiving` | tsg.receiving.view |
| Pemakaian Material | `/admin/reports/material-usage` | shift.view |
| Material Keluar | `/admin/reports/material-out` | tsg.inventory.view |

### Admin — Administrasi (SUPERADMIN)
| Halaman | URL | Role |
|---|---|---|
| Correction | `/admin/corrections` | SUPERADMIN |
| Users & Roles | `/admin/users` | SUPERADMIN |
| Master Data | `/admin/master-data` | SUPERADMIN |
| Master Consumable | `/admin/master-consumables` | SUPERADMIN |
| Master Sparepart | `/admin/master-spareparts` | SUPERADMIN |
| Audit Log | `/admin/audit` | SUPERADMIN |
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
