# CLAUDE.md — Konteks untuk Claude Code

Panduan untuk Claude Code (dan LLM assistant lain) yang bekerja di repo ini. Berisi konteks bootstrap, konvensi kode, dan aturan wajib.

---

## Konteks Proyek

Sistem MES + WMS multi-cabang untuk pabrik rokok Hummer. **Belum ada source code** — masih fase dokumentasi. Coding Fase 0 (foundation) belum dimulai.

Dokumentasi lengkap:
- [`README.md`](./README.md) — entry point repo
- [`docs/README.md`](./docs/README.md) — indeks dokumentasi lengkap (20+ file)
- [`docs/catatan-diskusi.md`](./docs/catatan-diskusi.md) — log diskusi + rasionale keputusan

**Baca dulu sebelum coding**: [`docs/03-architecture.md`](./docs/03-architecture.md), [`docs/04-data-model.md`](./docs/04-data-model.md), [`docs/09-fase-1-pilot-spec.md`](./docs/09-fase-1-pilot-spec.md).

---

## Tech Stack (Ditentukan, Jangan Diganti Tanpa Diskusi)

- **Framework**: Next.js 15 (App Router + RSC + Route Handlers).
- **Language**: TypeScript strict mode.
- **Database**: PostgreSQL 16.
- **ORM**: **Drizzle** (BUKAN Prisma — ADR-002 di `docs/03-architecture.md`).
- **Auth**: JWT + refresh token dengan 2FA untuk SUPERADMIN (BUKAN NextAuth default).
- **UI**: Tailwind CSS + Shadcn/UI.
- **Deployment**: Vercel single region Singapore.
- **Package manager**: pnpm.

---

## Konvensi Wajib

### Multi-Tenant + RLS
- **Semua tabel operasional wajib `plantId` NOT NULL**. Tanpa pengecualian.
- **RLS PostgreSQL** sebagai final gate. Session variable `app.current_plant_ids` di-inject dari JWT + `user_assignment`.
- Client **tidak pernah** kirim `plantId` untuk filter. Nilai diambil dari session scope resolver.

### API-First
- **Semua operasi lewat REST endpoint** `/api/v1/*` (bukan Server Actions saja).
- Web dan mobile Flutter konsumsi endpoint yang sama.
- **Idempotency-Key header wajib** di semua POST/PATCH.

### Kalkulasi Server-Side
- Yield, berat per batang, dan semua kalkulasi produksi = **server-side**.
- Client tidak boleh hitung sendiri (operator tidak boleh bisa manipulasi via DevTools).

### Aturan Bisnis Kunci
- **Ganti produk di tengah shift tidak diizinkan** — harus end shift + start baru.
- **TSG box wajib dari inventory AVAILABLE** — bukan free-text.
- **FIFO enforcement** untuk TSG inventory (override butuh permission + audit log).
- **Shift APPROVED = LOCKED immutable** — perubahan hanya via CORRECTION (HQ_AUDITOR).
- **Handoff eksplisit** saat end shift dengan boks aktif belum habis.
- **Single-session mobile**: 1 user hanya 1 sesi mobile aktif. Pindah device via SUPERADMIN revoke.
- **SUPERADMIN max 3 aktif** per system.
- **Audit log** untuk semua mutasi.
- **Soft delete** (`deletedAt`) di semua tabel operasional.

### Compliance
- Retensi data 10 tahun (cukai).
- Setiap privileged action (SUPERADMIN) → audit `is_privileged=true` + broadcast self-policing.

### Naming
- **Nama tabel/entity**: `PascalCase` di doc/TS, `snake_case` di SQL.
- **Nama field**: `camelCase` di TS/Drizzle, `snake_case` di SQL.
- **Role code**: `SNAKE_UPPER` (`OPERATOR_KECER`).
- **Permission**: `dot.case` (`shift.approve`).
- **URI QR**: `ohmes://{type}/{plantId}/{entityId}`.

### Bahasa Dokumentasi
- **Bahasa Indonesia** untuk semua dokumen di `docs/`.
- Istilah teknis (API, RLS, JWT) dibiarkan bahasa Inggris.
- Komentar kode boleh Inggris atau Indonesia — konsisten dalam satu file.

---

## Directive untuk Claude Code

### Sebelum Menulis Kode
1. **Baca dokumentasi relevan** — jangan bikin skema/endpoint baru tanpa cek `04-data-model.md` dan `06-api-spec.md`.
2. **Cek permission matrix** di `docs/05-rbac-matrix.md` sebelum implement endpoint.
3. **Kalau ragu**, cek `docs/catatan-diskusi.md` untuk rasionale historis.

### Saat Menulis Kode
1. **Wajib TypeScript strict**. `any` = red flag.
2. **Wajib zod validation** di boundary API.
3. **Wajib audit log** untuk mutasi.
4. **Wajib RLS-aware** — set session variable sebelum query.
5. **Wajib idempotency** — POST/PATCH implement idempotency-key store.
6. **Jangan hardcode konstanta** yang harus dari master data (mis. yield range — ambil dari `machine_template`).
7. **Jangan skip test** — cover happy path + edge case + RLS negative test.

### Setelah Menulis Kode
1. **Update dokumentasi** kalau ada perubahan skema/endpoint/rule.
2. **Update `docs/mobile-team/`** kalau ada perubahan yang affect mobile API contract.
3. **Update CHANGELOG** untuk release notes.
4. **Test di CI** sebelum merge.

### Jangan Lakukan
- ❌ Jangan skip RLS "sementara buat testing" — bikin bug production.
- ❌ Jangan bikin endpoint `/admin/*` tanpa cek permission properly.
- ❌ Jangan hitung yield di client.
- ❌ Jangan UPDATE tabel LOCKED — pakai CORRECTION flow.
- ❌ Jangan bypass single-session mobile enforcement.
- ❌ Jangan simpan secret di code — pakai env vars (lihat `.env.example`).
- ❌ Jangan commit `settings.local.json` atau `.env` (sudah di-gitignore).

---

## Skills / Slash Commands Rekomendasi

Kalau tim developer pakai Claude Code, skills yang berguna:
- `/init` — kalau perlu re-baseline CLAUDE.md.
- `/code-review` sebelum PR merge.
- `/simplify` untuk refactor code yang berbelit.
- `/security-review` sebelum deploy production.

---

## Referensi Cepat

| Butuh info tentang... | Buka |
|---|---|
| Istilah domain (TSG, HLP, Kecer, dsb.) | [`docs/00-glossary.md`](./docs/00-glossary.md) |
| Skema data + RLS policy | [`docs/04-data-model.md`](./docs/04-data-model.md) |
| Endpoint + contoh payload | [`docs/06-api-spec.md`](./docs/06-api-spec.md) |
| Permission per role | [`docs/05-rbac-matrix.md`](./docs/05-rbac-matrix.md) |
| Setup local dev | [`SETUP.md`](./SETUP.md) |
| Deployment | [`docs/14-deployment-infra.md`](./docs/14-deployment-infra.md) |
| Test | [`docs/15-testing-strategy.md`](./docs/15-testing-strategy.md) |
| Runbook incident | [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md) |
| Backup / DR | [`docs/18-backup-recovery.md`](./docs/18-backup-recovery.md) |
| Migrasi dari paper | [`docs/19-data-migration.md`](./docs/19-data-migration.md) |
| Error code catalog | [`docs/20-api-error-catalog.md`](./docs/20-api-error-catalog.md) |

---

*Update CLAUDE.md kalau ada konvensi/aturan baru yang harus di-enforce.*
