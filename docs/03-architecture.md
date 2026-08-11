# 03 · Arsitektur Sistem & Deployment

Dokumen arsitektur high-level untuk MES multi-cabang. Fokus pada **struktur komponen, data flow, batas kepercayaan, dan keputusan arsitektur (ADR)** — bukan detail skema (lihat [`04-data-model.md`](./04-data-model.md)).

---

## 1. Konteks (C4 Level 1)

```
                          ┌─────────────────────────────┐
                          │      Kantor Pusat / HQ      │
                          │  (Admin · Analyst · Audit)  │
                          └──────────────┬──────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │      MES Multi-Cabang        │
                          │        (sistem ini)          │
                          └──┬───────────┬───────────┬──┘
                             │           │           │
             ┌───────────────┘           │           └───────────────┐
             │                           │                           │
    ┌────────▼────────┐        ┌─────────▼────────┐        ┌────────▼─────────┐
    │ Koordinator     │        │ Supervisor       │        │ Operator Kecer   │
    │ Area            │        │ Pabrik           │        │ (Tim shift)      │
    │ (Web dashboard) │        │ (Web + tablet)   │        │ (Tablet · mobile)│
    └─────────────────┘        └──────────────────┘        └──────────────────┘

    Integrasi luar (fase lanjut):
    - Sistem HR (export absensi tim shift)
    - Sistem cukai / regulator (export bulanan)
    - Gudang bahan baku (receiving TSG via QR/API)
```

**Aktor**:
- **HQ**: baca rollup, kelola master data, audit.
- **Koordinator Area**: pantau pabrik dalam wilayahnya.
- **Supervisor Pabrik**: approve shift, verifikasi anomali.
- **Operator Kecer**: input data produksi realtime.

**Sistem eksternal (fase lanjut)**: HR, cukai, gudang — di luar scope 5 fase awal.

---

## 2. Container (C4 Level 2)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         BROWSER / MOBILE DEVICE                           │
├────────────────────────────────┬──────────────────────────────────────────┤
│  Web App (Next.js SSR + RSC)   │  Mobile App (Flutter, Fase 3)            │
│  - Tablet operator             │  - Operator lapangan                     │
│  - Dashboard supervisor/area   │  - QR scan · local queue (SQLite/Drift)  │
│  - Dashboard HQ                │                                          │
└──────────┬─────────────────────┴──────────────┬───────────────────────────┘
           │ HTTPS (JWT + refresh)              │
           │                                    │
           ▼                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     API LAYER  (Next.js Route Handlers)                   │
│  ┌────────────┬──────────────┬───────────────┬──────────────┬──────────┐  │
│  │ Auth       │ Scope        │ Validation    │ Business     │ Audit    │  │
│  │ (JWT)      │ Resolver     │ (zod)         │ Rules        │ Log      │  │
│  └────────────┴──────────────┴───────────────┴──────────────┴──────────┘  │
│  Idempotency-Key store · Rate limiter · Error handler                     │
└──────────┬────────────────────────────────────┬───────────────────────────┘
           │ Drizzle ORM (parameterized SQL)    │
           │ + session RLS context              │
           ▼                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL 16 (shared schema)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  ROW-LEVEL SECURITY (RLS)                                           │  │
│  │  policy: current_user_scopes @> plant_id                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  Operasional:  shift_report · shift_member · shift_waste ·                │
│                shift_handoff · tsg_box_process · tsg_box_consumption ·    │
│                downtime_log · maintenance_event · batch                   │
│                                                                            │
│  Master data:  product · plant_product · machine · machine_template ·     │
│                consumable_item · sparepart · shift_role · shift_template  │
│                                                                            │
│  Tenancy:      company · region · plant · user · user_assignment ·        │
│                role · permission · role_permission                        │
│                                                                            │
│  Compliance:   audit_log · qr_registry                                    │
│                                                                            │
│  Materialized: mv_area_daily_kpi (refresh: shift APPROVED) ·              │
│  Views         mv_hq_monthly_rollup (refresh: nightly cron)               │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deployment Topology

```
                    ┌─────────────────────────┐
                    │      Vercel Edge        │
                    │  (Next.js + API + SSR)  │
                    │  Region: Singapore      │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Managed PostgreSQL 16  │
                    │  (Neon / Supabase /     │
                    │   RDS)                  │
                    │  Region: Singapore      │
                    │  - Primary + read replica│
                    │  - Automated backup 7d  │
                    └─────────────────────────┘

Object storage (Fase 3+): Vercel Blob / S3 untuk asset QR PNG, export cukai.
Monitoring: Vercel Analytics + Sentry error tracking + PostgreSQL metrics.
CI/CD: GitHub Actions → build → lint → test → migration → deploy.
```

**Alasan single region Singapore**: seluruh pabrik di Indonesia, latency Singapore ↔ Indonesia ~30–50ms (aman untuk operasional tablet real-time).

---

## 4. Auth Flow (JWT + Refresh Token)

```
┌──────────┐   1. POST /auth/login (username, password)          ┌─────────┐
│  Client  │─────────────────────────────────────────────────────▶│   API   │
│ (web/    │                                                      │         │
│  mobile) │◀─────────────────────────────────────────────────────│         │
└──────────┘   2. { accessToken (15m), refreshToken (30d),         └─────────┘
                    user, activeScopes[] }
                                                                      │
                                                                      │
┌──────────┐   3. GET /shifts  (Authorization: Bearer <access>)   ┌─────────┐
│  Client  │─────────────────────────────────────────────────────▶│   API   │
│          │                                                      │ 4. verify JWT
│          │◀─────────────────────────────────────────────────────│ 5. inject scope
└──────────┘   6. { data: [...] }                                  │    to session
                                                                   │ 7. RLS filter
                                                                   └─────────┘

Access token expired?
┌──────────┐   POST /auth/refresh (refreshToken)                  ┌─────────┐
│  Client  │─────────────────────────────────────────────────────▶│   API   │
│          │◀─────────────────────────────────────────────────────│         │
└──────────┘   { accessToken (baru), refreshToken (rotated) }      └─────────┘
```

**Detail**:
- Access token: JWT signed HS256, expiry 15 menit, claim `{ userId, activeScopeIds[], roleIds[] }`.
- Refresh token: opaque string di DB (tabel `user_session`), expiry 30 hari, rotasi tiap refresh (invalidate lama).
- Multi-scope user: saat login, user memilih **active scope** (jika punya banyak). Bisa switch lewat `POST /auth/switch-scope`.
- Logout: hapus refresh token dari DB → subsequent refresh gagal.

---

## 5. Data Flow — Contoh Alur "Operator Timbang Boks"

```
┌────────────┐  PATCH /boxes/:id { outputWeightKg }               ┌──────────┐
│   Tablet   │──────────────────────────────────────────────────▶│   API    │
│  operator  │  Idempotency-Key: box-weigh-abc123                 │          │
└────────────┘                                                     │  1. auth │
                                                                   │  2. scope│
                                                                   │  3. valid│
                                                                   │  4. get  │
                                                                   │     Mach │
                                                                   │     Tmpl │
                                                                   │  5. hitung│
                                                                   │    yield  │
                                                                   │  6. save  │
                                                                   │  7. audit │
                                                                   │  8. resp  │
                                                                   └────┬─────┘
                                                                        │
                                                                        ▼
                                                                   ┌──────────┐
                                                                   │Postgres  │
                                                                   │ UPDATE   │
                                                                   │ tsg_box_ │
                                                                   │ process  │
                                                                   │ + INSERT │
                                                                   │ audit_log│
                                                                   └──────────┘

                                                                   NOTE: MV
                                                                   TIDAK di-refresh
                                                                   di sini — hanya
                                                                   pada APPROVED.
```

Trigger MV `mv_area_daily_kpi` refresh dipanggil di endpoint `POST /shifts/:id/approve`, bukan di setiap mutasi — supaya rollup Area/HQ hanya menampilkan data yang sudah locked.

---

## 6. Keputusan Arsitektur Utama (ADR)

### ADR-001 · Shared Schema + RLS, bukan DB per pabrik
**Konteks**: 30+ pabrik dengan multi-scope user.
**Keputusan**: Satu database PostgreSQL, satu schema. Semua tabel operasional wajib `plantId` NOT NULL. RLS policy pakai `current_setting('app.current_scope_ids')::uuid[]` dibandingkan dengan `plantId`.
**Konsekuensi**:
- ✅ Multi-scope query trivial (SELECT lintas plant tanpa join lintas DB).
- ✅ Migration & backup satu unit.
- ⚠️ RLS harus terverifikasi ketat — bug policy = data leak.
- ⚠️ Query performance harus di-index dengan `plantId` sebagai leading column.
- **Exception SUPERADMIN**: session dengan `app.bypass_rls = true` diperbolehkan hanya untuk endpoint terpilih (`/super/*`, `/audit-logs/*` cross-tenant, migration). Policy pattern: `(plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])) OR current_setting('app.bypass_rls', true) = 'true'`. Session pengguna normal **tidak pernah** set bypass — hanya SUPERADMIN + service admin CLI.

### ADR-002 · Drizzle ORM, bukan Prisma
**Konteks**: Butuh RLS support + query builder fleksibel untuk aggregation.
**Keputusan**: Drizzle ORM.
**Konsekuensi**:
- ✅ RLS session context bisa di-set eksplisit sebelum query (`SET LOCAL app.current_scope_ids = ...`).
- ✅ Query builder support subquery kompleks untuk rollup KPI.
- ✅ Migration file transparan (SQL murni) — mudah audit.
- ⚠️ Ekosistem lebih kecil dari Prisma; beberapa tooling generator harus di-custom.

### ADR-003 · JWT + Refresh Token, bukan cookie session NextAuth
**Konteks**: Mobile Flutter di Fase 2 butuh auth stateless.
**Keputusan**: JWT (HS256) 15 menit + refresh token 30 hari di DB.
**Konsekuensi**:
- ✅ Web & mobile pakai auth flow sama.
- ✅ Refresh token rotasi → mitigasi token theft.
- ⚠️ Butuh implement sendiri (bukan NextAuth default), termasuk logout revocation.

### ADR-004 · API-first (REST v1), bukan Server Actions saja
**Konteks**: Flutter tidak bisa konsumsi Server Actions.
**Keputusan**: Semua operasi lewat REST endpoint `/api/v1/*`. Web app konsumsi via `fetch` di Client Components atau server-side di RSC.
**Konsekuensi**:
- ✅ Kontrak API terdokumentasi, versioned.
- ✅ Mobile & web menggunakan endpoint yang sama.
- ⚠️ Sedikit lebih verbose dibanding Server Actions untuk web-only feature.

### ADR-005 · Materialized View untuk rollup Area/HQ
**Konteks**: 30+ pabrik × query rollup real-time akan lambat.
**Keputusan**: `mv_area_daily_kpi` refresh saat shift APPROVED; `mv_hq_monthly_rollup` refresh nightly.
**Konsekuensi**:
- ✅ Dashboard Area/HQ cepat (query MV, bukan agregasi live).
- ✅ Data pada dashboard = data locked (konsisten dengan compliance).
- ⚠️ MV refresh butuh index yang bagus supaya tidak lock produksi.

### ADR-006 · Shift Handoff Eksplisit, bukan formula bercabang
**Konteks**: Carry-over TSG antar shift menyebabkan yield literal >300% di baris 1.
**Keputusan**: Tabel `ShiftHandoff` dengan flow: end shift dengan boks aktif → wajib timbang → shift baru auto-claim.
**Konsekuensi**:
- ✅ Attribusi batangan per shift bersih, yield valid.
- ✅ Siap dipakai KPI operator kapan saja tanpa migrasi data.
- ⚠️ +2 menit di pergantian shift untuk operator lama menimbang. Trade-off disetujui.

### ADR-007 · Idempotency-Key wajib di semua POST/PATCH
**Konteks**: Tablet & mobile bisa retry karena network glitch.
**Keputusan**: Header `Idempotency-Key` wajib. Server menyimpan mapping `(userId, key) → response` selama 24 jam. Duplikat = balik response cache, bukan bikin record baru.
**Konsekuensi**:
- ✅ Retry aman, tidak dobel-record.
- ⚠️ Butuh storage untuk cache (Redis atau tabel `idempotency_key`).

### ADR-008 · Approval 1 Level → LOCKED, bukan berjenjang
**Konteks**: Approval berjenjang menghambat data ke rollup.
**Keputusan**: Supervisor pabrik saja. Setelah APPROVED, shift immutable — perubahan hanya via CORRECTION.
**Konsekuensi**:
- ✅ Data cepat masuk rollup Area/HQ.
- ✅ Compliance-friendly (immutable + audit trail).
- ⚠️ Butuh mekanisme CORRECTION yang jelas untuk kasus edge.

### ADR-009 · SUPERADMIN dengan Bypass RLS + Self-Policing (2026-08-10)
**Konteks**: Vendor developer + IT lead perusahaan butuh akses cross-tenant untuk debugging + audit + emergency recovery, tapi risiko compromise satu akun SUPERADMIN = jebol seluruh sistem.
**Keputusan**: Role SUPERADMIN dengan `scope_level = 'GLOBAL'` yang bisa bypass RLS, tapi **dibatasi ketat**:
- Max 3 aktif per system (enforced di service).
- 2FA wajib (WhatsApp OTP atau TOTP).
- Session pendek: JWT 5 menit (vs default 15), refresh 7 hari (vs default 30).
- Bootstrap awal lewat CLI script (`npm run seed:superadmin`), bukan UI.
- **Self-policing**: setiap privileged action broadcast notification ke SUPERADMIN lain aktif.
- Semua aksi otomatis `audit_log.is_privileged = true` + tercatat di security log.
- Opsional IP allowlist per environment.

**Konsekuensi**:
- ✅ Vendor bisa troubleshoot cross-tenant tanpa harus jalan-jalan ke pabrik.
- ✅ Compromise satu akun SUPERADMIN tercatat cepat (self-policing).
- ✅ Compliance audit — semua privileged action terlacak.
- ⚠️ Butuh implementasi 2FA (bisa pakai Twilio WA API atau library TOTP).
- ⚠️ Butuh notification system in-app (bisa SSE atau polling awal, WebSocket kalau perlu).
- ⚠️ Tabel tambahan: `auth_policy` per role, kolom `is_privileged` di `role` & `audit_log`.

---

## 7. Batas Kepercayaan (Trust Boundaries)

```
        [ USER INPUT ]                  [ INTERNAL API ]                [ DB ]
              │                                │                          │
              │ ── HTTPS ──▶ [validation] ──▶ ─────[RLS] ─────▶ ─────────│
              │              zod schema         boundary                  │
              │              rate limiter                                 │
              │                                                           │
       [ TIDAK PERCAYA ]              [ SUDAH DIVERIFIKASI ]      [ TERISOLASI ]
```

- **Client**: tidak pernah diperbolehkan mengirim `plantId` untuk filter — nilai diambil dari JWT + session scope.
- **API layer**: validation, auth, scope resolution, business rules SEBELUM database.
- **DB**: RLS sebagai final gate. Bahkan superuser API tanpa scope context tidak boleh SELECT.

---

## 8. Referensi
- [`04-data-model.md`](./04-data-model.md) — detail skema, RLS policy.
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) — permission mechanics.
- [`06-api-spec.md`](./06-api-spec.md) — kontrak API.
- [`08-roadmap.md`](./08-roadmap.md) — fase implementasi.
