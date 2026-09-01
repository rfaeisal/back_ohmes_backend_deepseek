# Documentation Pack — MES + WMS Multi-Cabang (Hummer)

**Sistem terintegrasi** untuk operasi pabrik rokok multi-cabang, multi-merek — mencakup **penerimaan bahan baku (WMS Inbound) → produksi (MES) → penyimpanan barang jadi (WMS Outbound) → distribusi (Dispatch)**. Produk utama: **Hummer**. Target skala: 30+ pabrik heterogen dengan hirarki `Kantor Pusat → Koordinator Area → Pabrik`.

> **Status**: Fondasi tertulis sebelum coding. Dokumen ini adalah acuan untuk PRD review, desain teknis, dan onboarding tim.
> **Versi**: v2 — dengan scope expansion (WMS Inbound + Outbound + Distribusi). Sebelumnya v1 hanya MES produksi.
> **Bahasa**: Semua dokumentasi dalam Bahasa Indonesia. Istilah teknis (API, RLS, JWT, dsb.) dibiarkan dalam bahasa Inggris.
> **Format tanggal**: `YYYY-MM-DD` (ISO 8601). Zona waktu: WIB (+07:00) seragam.

---

## Cara Baca — Berdasarkan Peran

| Peran Pembaca | Baca Ini Dulu |
|---|---|
| **Stakeholder bisnis / Product Owner** | [`01-prd.md`](./01-prd.md) → [`08-roadmap.md`](./08-roadmap.md) → [`02-user-stories.md`](./02-user-stories.md) |
| **Arsitek / Tech Lead** | [`03-architecture.md`](./03-architecture.md) → [`04-data-model.md`](./04-data-model.md) → [`05-rbac-matrix.md`](./05-rbac-matrix.md) |
| **Backend Developer (Fase 0–1)** | [`04-data-model.md`](./04-data-model.md) → [`06-api-spec.md`](./06-api-spec.md) → [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) → [`10-wms-inbound-spec.md`](./10-wms-inbound-spec.md) |
| **Frontend Developer (Tablet Web)** | [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) → [`10-wms-inbound-spec.md`](./10-wms-inbound-spec.md) → [`06-api-spec.md`](./06-api-spec.md) → [`05-rbac-matrix.md`](./05-rbac-matrix.md) |
| **Mobile Developer (Flutter, Fase 3)** | [`13-mobile-app-spec.md`](./13-mobile-app-spec.md) → [`07-qr-strategy.md`](./07-qr-strategy.md) → [`06-api-spec.md`](./06-api-spec.md) → [`20-api-error-catalog.md`](./20-api-error-catalog.md) |
| **DevOps / SRE** | [`14-deployment-infra.md`](./14-deployment-infra.md) → [`16-observability.md`](./16-observability.md) → [`17-operations-runbook.md`](./17-operations-runbook.md) → [`18-backup-recovery.md`](./18-backup-recovery.md) |
| **QA / Test** | [`15-testing-strategy.md`](./15-testing-strategy.md) → [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) §6 |
| **PM saat cutover pabrik** | [`19-data-migration.md`](./19-data-migration.md) → [`17-operations-runbook.md`](./17-operations-runbook.md) |
| **Compliance / DPO** | [`22-compliance-pdp.md`](./22-compliance-pdp.md) → [`21-data-retention-classification.md`](./21-data-retention-classification.md) → [`SECURITY.md`](../SECURITY.md) |
| **Backend Developer (Fase 5-6 WMS Outbound + Dispatch)** | [`11-wms-outbound-spec.md`](./11-wms-outbound-spec.md) → [`12-dispatch-spec.md`](./12-dispatch-spec.md) → [`04-data-model.md`](./04-data-model.md) §7B-7C |
| **DevOps / SRE** | [`03-architecture.md`](./03-architecture.md) → [`08-roadmap.md`](./08-roadmap.md) |
| **Tim baru / onboarding** | [`00-glossary.md`](./00-glossary.md) → [`01-prd.md`](./01-prd.md) → semua lainnya sesuai kebutuhan |

---

## Struktur Dokumen

| # | File | Isi | Ditujukan Untuk |
|---|---|---|---|
| — | [`README.md`](./README.md) | Indeks (dokumen ini) | Semua |
| 00 | [`00-glossary.md`](./00-glossary.md) | Kamus istilah domain (TSG, HLP, Menir, Kecer, dsb.) | Semua — baca sekali di awal |
| 01 | [`01-prd.md`](./01-prd.md) | Product Requirements: masalah, tujuan, persona (13 role termasuk SUPERADMIN), fitur | Bisnis + Tech |
| 02 | [`02-user-stories.md`](./02-user-stories.md) | User stories per role, per fase (0-6) | Bisnis + Dev |
| 03 | [`03-architecture.md`](./03-architecture.md) | Arsitektur, deployment, ADR utama | Tech |
| 04 | [`04-data-model.md`](./04-data-model.md) | ERD + skema Drizzle multi-tenant + RLS (termasuk WMS + Dispatch) | Backend |
| 05 | [`05-rbac-matrix.md`](./05-rbac-matrix.md) | Matriks Role × Permission × Scope (13 role — SUPERADMIN, HQ×3, AREA×2, PLANT×7) | Backend + Frontend |
| 06 | [`06-api-spec.md`](./06-api-spec.md) | Konvensi API + endpoint Fase 1-6 | Backend + Frontend + Mobile |
| 07 | [`07-qr-strategy.md`](./07-qr-strategy.md) | QR code lifecycle + Flutter guidance (Fase 3) | Mobile |
| 08 | [`08-roadmap.md`](./08-roadmap.md) | Roadmap 7 fase + acceptance criteria per fase | Bisnis + Tech |
| 09 | [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) | Spec teknis Fase 1 — pilot MES + WMS Inbound | Dev tim Fase 1 |
| 10 | [`10-wms-inbound-spec.md`](./10-wms-inbound-spec.md) | Spec teknis WMS Inbound (Fase 1) — receiving TSG + inventory FIFO | Dev Fase 1 (gudang) |
| 11 | [`11-wms-outbound-spec.md`](./11-wms-outbound-spec.md) | Spec teknis WMS Outbound (Fase 5) — receiving pack + cartoning | Dev Fase 5 |
| 12 | [`12-dispatch-spec.md`](./12-dispatch-spec.md) | Spec teknis Distribusi (Fase 6) — dispatch order + surat jalan PDF | Dev Fase 6 |
| 13 | [`13-mobile-app-spec.md`](./13-mobile-app-spec.md) | Spec teknis mobile Flutter (Fase 3) — auth + **single-session enforcement** + local queue + deep link | Mobile dev |
| 14 | [`14-deployment-infra.md`](./14-deployment-infra.md) | Deployment production: Vercel + Neon + env vars + CI/CD | DevOps |
| 15 | [`15-testing-strategy.md`](./15-testing-strategy.md) | Testing pyramid: unit/integration/e2e/perf + coverage target | QA + Dev |
| 16 | [`16-observability.md`](./16-observability.md) | Logging, metrics, tracing, dashboards, alerts, SLO | DevOps + Dev |
| 17 | [`17-operations-runbook.md`](./17-operations-runbook.md) | Incident response, on-call, common issues, escalation | DevOps + On-Call |
| 18 | [`18-backup-recovery.md`](./18-backup-recovery.md) | Backup strategy, RTO/RPO, disaster recovery, DR drill | DevOps + Compliance |
| 19 | [`19-data-migration.md`](./19-data-migration.md) | Migrasi dari paper ke sistem: prep + cutover + stabilize | PM + Deployment tim |
| 20 | [`20-api-error-catalog.md`](./20-api-error-catalog.md) | Registry terpusat semua error code + client handling pattern | All dev |
| 21 | [`21-data-retention-classification.md`](./21-data-retention-classification.md) | Data classification (public/internal/confidential/restricted) + retention matrix 10 tahun | Backend + Compliance |
| 22 | [`22-compliance-pdp.md`](./22-compliance-pdp.md) | UU PDP 27/2022 Indonesia compliance: prinsip, hak subjek, DPO, breach notification | Compliance + DPO |
| 23 | [`23-hlp-session-design.md`](./23-hlp-session-design.md) | DRAFT: sesi HLP open-ended + ganti anggota, input tablet (material/downtime/sparepart/waste), reject pack, ledger rijekan | Backend + Mobile |
| 24 | [`24-external-batangan.md`](./24-external-batangan.md) | DRAFT: makloon packing — terima batangan external (kg, approval), proses HLP, pack + rijekan dikembalikan ke customer (PDF serah terima) | Backend + Mobile |
| 25 | [`25-production-chain.md`](./25-production-chain.md) | DRAFT: rantai HLP → WR → SLOP → BAL → karton manual — catatan per-stage, pemakaian/waste material per mesin, makloon multi-stage entry/exit | Backend + Mobile |

## Dokumen Pendukung

- [`draft.txt`](./draft.txt) — Konsep awal single-plant (referensi historis, sudah di-supersede oleh pack ini).
- [`catatan-diskusi.md`](./catatan-diskusi.md) — Log diskusi awal & rasionale keputusan. Berguna untuk memahami *kenapa* keputusan diambil.

## Paket Terkurasi untuk Tim Eksternal

- **[`mobile-team/`](./mobile-team/)** — paket dokumentasi mandiri untuk tim mobile Flutter (external vendor / freelancer). Berisi 8 file: README + brief + app-spec + api-contract + qr-strategy + glossary + rbac-mobile + changelog. **Bisa dikirim langsung as ZIP tanpa dependency ke file lain di `docs/`.** Kalau ada update master, tandai di `mobile-team/CHANGELOG.md` dan re-generate paket.

## Sumber Visual

Blueprint interaktif (7 panel: Hirarki, Workflow, Data Flow, Business Flow, Shift Handoff, QR & Mobile, RBAC):
**https://claude.ai/code/artifact/bca76e88-04f7-4cd5-8b18-0554a47f3f9f**

---

## Prinsip Desain — Ringkas

1. **API-first sejak awal** — web (Next.js) dan mobile (Flutter) konsumsi API layer yang sama. Auth: JWT + refresh token.
2. **Multi-tenant shared schema + RLS** — semua tabel operasional wajib `plantId` NOT NULL. Isolasi otomatis di database level.
3. **Multi-produk didukung sejak Fase 0** — `Product` = master data pusat. Ganti produk di tengah shift tidak diizinkan.
4. **Tim shift many-to-many** — bukan 1 kecer per shift. `ShiftRole` fleksibel per pabrik.
5. **Waste 4 kategori** dengan `settlementStatus` — Menir, Rijekan, Debu Kasar, Debu Halus.
6. **Consumables event log per boks** — bukan snapshot shift total.
7. **Shift Handoff eksplisit** — pergantian shift dengan boks aktif belum habis wajib timbang. Attribusi batangan bersih.
8. **Approval 1 level → LOCKED** — supervisor pabrik approve, shift jadi immutable. Perubahan hanya lewat CORRECTION oleh HQ_AUDITOR.
9. **Compliance-first** — AuditLog + soft delete + LOCKED. Industri rokok = regulasi ketat.
10. **Idempotency di semua POST** — tablet & mobile boleh retry, server dedup dengan `Idempotency-Key`.
11. **WMS Inbound accountability** — TSG box yang di-open operator wajib dari `tsg_inventory` status `AVAILABLE`. FIFO enforcement dengan audit override.
12. **Cartoning traceability** — pack HLP → karton → dispatch order. Lineage bisa di-trace balik dari karton ke shift/operator/mesin/produk.
13. **Dispatch minimal manual** — surat jalan PDF dengan template per pabrik. Bukan full order management/TMS.
14. **SUPERADMIN privileged role** — vendor developer + IT lead (max 3 aktif). Bypass RLS, akses audit trail + security log lengkap, 2FA wajib, session pendek (JWT 5 menit), semua aksi ke audit `is_privileged=true` + broadcast self-policing.
15. **Single-session mobile** — 1 user hanya boleh 1 sesi aktif di mobile. Coba login di device kedua → 409 SESSION_EXISTS. Untuk pindah device, SUPERADMIN wajib revoke sesi lama dulu. Web tetap boleh concurrent.

---

## Konvensi Penulisan

- **Nama entity/tabel**: `PascalCase` di dokumen, `snake_case` di SQL.
- **Nama field**: `camelCase` di TypeScript/Drizzle, `snake_case` di SQL.
- **Nama role & permission**: `SNAKE_UPPER` untuk role (mis. `HQ_ADMIN`), `dot.case` untuk permission (mis. `shift.approve`).
- **Format URI QR**: `ohmes://{type}/{plantId}/{entityId}`.
- **Format Idempotency-Key**: prefix per operasi, mis. `shf-start-{uuid}`, `box-open-{uuid}`.
