# back_ohmes_backend — MES + WMS Hummer

Sistem terintegrasi **Manufacturing Execution System (MES) + Warehouse Management System (WMS)** untuk operasi pabrik rokok multi-cabang. Produk utama: **Hummer**. Target skala: 30+ pabrik heterogen dengan hirarki `Kantor Pusat → Koordinator Area → Pabrik`.

**Status**: pra-coding — dokumentasi lengkap, coding Fase 0 belum dimulai.

---

## Cakupan Sistem

End-to-end 5 tahap operasional pabrik:

1. **Terima TSG dari supplier** (WMS Inbound · Fase 1)
2. **Simpan TSG di gudang** dengan inventory FIFO (WMS Inbound · Fase 1)
3. **Produksi** (Maker + HLP + shift) (MES · Fase 1)
4. **Simpan barang jadi** + cartoning dengan traceability (WMS Outbound · Fase 5)
5. **Distribusi basic** dengan surat jalan PDF (Dispatch · Fase 6)

**Bukan** full WMS/ERP/TMS/CRM.

---

## Tech Stack (Rencana)

| Layer | Stack |
|---|---|
| Framework | Next.js 15 (App Router, RSC, Route Handlers) |
| Language | TypeScript 5.x |
| Database | PostgreSQL 16 (managed: Neon / Supabase / RDS) |
| ORM | Drizzle ORM |
| Auth | JWT + refresh token (dengan 2FA untuk SUPERADMIN) |
| UI | Tailwind CSS + Shadcn/UI |
| Mobile | Flutter 3.16+ (Android 8+, iOS 13+) |
| Deployment | Vercel (Edge + Functions), single region Singapore |
| Monitoring | Vercel Analytics + Sentry + PostgreSQL metrics |
| CI/CD | GitHub Actions |

---

## Struktur Repo

```
back_ohmes_backend/
├── README.md                   # File ini
├── CLAUDE.md                   # Panduan Claude Code untuk tim dev
├── SETUP.md                    # Cara set up local dev environment
├── CONTRIBUTING.md             # Cara kontribusi
├── SECURITY.md                 # Security policy & disclosure
├── .env.example                # Template environment variables
├── .gitignore
├── docs/                       # Dokumentasi lengkap (20+ file markdown)
│   ├── README.md               # Indeks navigasi documentation pack
│   ├── 00-glossary.md → 20-*   # Master documentation pack
│   ├── mobile-team/            # Paket kurasi untuk tim mobile external
│   ├── draft.txt               # Konsep awal (superseded)
│   └── catatan-diskusi.md      # Log diskusi & rasionale keputusan
└── (source code — belum ada, coming di Fase 0)
```

---

## Cara Baca Dokumentasi

**Stakeholder / Product Owner**: [`docs/01-prd.md`](./docs/01-prd.md) → [`docs/08-roadmap.md`](./docs/08-roadmap.md)

**Arsitek / Tech Lead**: [`docs/03-architecture.md`](./docs/03-architecture.md) → [`docs/04-data-model.md`](./docs/04-data-model.md) → [`docs/14-deployment-infra.md`](./docs/14-deployment-infra.md)

**Backend Developer (Fase 0-1)**: [`SETUP.md`](./SETUP.md) → [`docs/09-fase-1-pilot-spec.md`](./docs/09-fase-1-pilot-spec.md) → [`docs/06-api-spec.md`](./docs/06-api-spec.md)

**Frontend Developer**: [`docs/09-fase-1-pilot-spec.md`](./docs/09-fase-1-pilot-spec.md) §1 (user journey) + §5 (UI guidelines)

**Mobile Developer (Flutter)**: paket khusus di [`docs/mobile-team/`](./docs/mobile-team/) — bisa dikirim as ZIP ke tim external.

**DevOps / SRE**: [`docs/14-deployment-infra.md`](./docs/14-deployment-infra.md) → [`docs/16-observability.md`](./docs/16-observability.md) → [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md) → [`docs/18-backup-recovery.md`](./docs/18-backup-recovery.md)

**QA / Test**: [`docs/15-testing-strategy.md`](./docs/15-testing-strategy.md)

**Onboarding tim baru**: [`docs/00-glossary.md`](./docs/00-glossary.md) → [`docs/01-prd.md`](./docs/01-prd.md) → semua lainnya.

**Indeks lengkap dokumentasi**: [`docs/README.md`](./docs/README.md)

---

## Quick Start (Coming di Fase 0)

Setelah scaffolding Fase 0 selesai:

```bash
git clone git@github.com:rfaeisal/back_ohmes_backend.git
cd back_ohmes_backend
cp .env.example .env
# Isi env vars sesuai SETUP.md
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Detail langkah demi langkah di [`SETUP.md`](./SETUP.md).

---

## Roadmap Ringkas

| Fase | Deliverable | Estimasi |
|---|---|---|
| 0 | Foundation (multi-tenant, RBAC, auth, master data) | 3–4 minggu |
| 1 | Pilot 1 pabrik: MES produksi + WMS Inbound basic | 6–8 minggu |
| 2 | Rollout multi-pabrik + dashboard area | 4 minggu |
| 3 | Mobile Flutter + QR + single-session enforcement | 6–8 minggu |
| 4 | HQ analytics + export cukai | 4 minggu |
| 5 | WMS Outbound: cartoning + traceability | 4–5 minggu |
| 6 | Distribusi basic: surat jalan PDF | 3 minggu |

**Total**: 30–36 minggu. Detail: [`docs/08-roadmap.md`](./docs/08-roadmap.md).

---

## Compliance

- **Industri rokok** = regulasi ketat (cukai, BPOM). Retensi data minimal **10 tahun**.
- Semua mutasi tercatat di `audit_log` dengan `before → after`.
- Shift APPROVED = **LOCKED (immutable)**. Perubahan hanya lewat CORRECTION (audit trail lengkap).
- Multi-tenant isolation via PostgreSQL Row-Level Security (RLS).

Detail: [`SECURITY.md`](./SECURITY.md), [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md).

---

## Lisensi & Kepemilikan

Internal proprietary. Kode & dokumentasi milik grup Hummer. Tidak untuk distribusi eksternal tanpa persetujuan tertulis.

---

## Kontak

- **PM**: *(nama + email)*
- **Backend Lead**: *(nama + email)*
- **Mobile Lead**: *(nama + email)*
- **DevOps / SRE**: *(nama + email)*
- **Security**: *(email — lihat SECURITY.md)*
