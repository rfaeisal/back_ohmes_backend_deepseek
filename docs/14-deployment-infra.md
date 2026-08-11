# 14 · Deployment & Infrastructure

Spec deployment production untuk MES + WMS Hummer. Environment: `dev` (local) · `staging` · `production`.

---

## 1. Architecture Overview

```
                         ┌─────────────────────────────┐
                         │  Vercel Edge Network        │
                         │  (CDN + Edge Middleware)    │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │  Next.js (Vercel Functions) │
                         │  Region: Singapore (sin1)   │
                         │  Runtime: Node.js 20        │
                         └──────────────┬──────────────┘
                                        │
                    ┌───────────────────┼────────────────────┐
                    │                   │                    │
                    ▼                   ▼                    ▼
         ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
         │  PostgreSQL 16   │ │  Vercel Blob     │ │  Upstash Redis   │
         │  (Neon/Supabase) │ │  (PDF, QR image) │ │  (rate limit,    │
         │  Region: SG      │ │                  │ │   idempotency)   │
         │  + read replica  │ │                  │ │                  │
         └──────────────────┘ └──────────────────┘ └──────────────────┘

External:
- Sentry (error tracking + performance monitoring)
- Twilio (WhatsApp OTP untuk 2FA SUPERADMIN)
- FCM (Android push) + APNs (iOS push) — Fase 3+
```

---

## 2. Environments

| Env | Purpose | URL | DB | Uptime SLA |
|---|---|---|---|---|
| `dev` | Local development (per dev) | `localhost:3000` | Docker Postgres | — |
| `staging` | QA + demo internal | `staging.mes.hummer.example` | Neon dedicated | 95% |
| `production` | Real operational | `mes.hummer.example` | Neon dedicated + replica | **99.5%** |

**Staging**: mirror production tapi data seed sintetis. Reset weekly.
**Production**: real data, backup daily, incident response 24/7.

---

## 3. Vercel Project Setup

### 3.1. Project Structure
- Vercel org: `hummer-group`
- Vercel project: `mes-wms-hummer`
- GitHub repo: `rfaeisal/back_ohmes_backend`

### 3.2. Region
Primary: `sin1` (Singapore). Alasan: latency terbaik untuk Indonesia (~30-50ms).
Fallback: `hnd1` (Tokyo) — nice-to-have Fase 2+.

### 3.3. Runtime
- Node.js 20 (LTS).
- Edge runtime untuk endpoint yang perlu low-latency (auth verify, QR resolve).
- Node runtime untuk endpoint DB-heavy (dashboard rollup, export).

### 3.4. Build
```json
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": ".next"
}
```

### 3.5. Function Limits (Fluid Compute default)
- Memory: 1024 MB (bump untuk endpoint export)
- Max duration: 60s default; 300s untuk export cukai batch

---

## 4. Database (PostgreSQL 16)

### 4.1. Provider
**Neon** (rekomendasi Fase 0-1) atau **Supabase** — kedua-duanya support pooling + RLS + branching.

Alternatif Fase 4+ kalau scale >100 pabrik: RDS PostgreSQL + PgBouncer.

### 4.2. Configuration
- Version: PostgreSQL 16.
- Region: Singapore (same as Vercel).
- Encryption at rest: AES-256 (default managed).
- Backup: automated daily (Neon: 7-day retention default, upgrade ke 30-day untuk prod).
- Read replica: 1 replica untuk read-heavy queries (dashboard).

### 4.3. Connection Pooling
- Vercel serverless butuh pooling — pakai Neon Pooler / Supabase Connection Pooler.
- Max connections dev: 20. Prod: 100.
- Format connection string:
  - Pooled (untuk app): `postgres://user:pass@pooler.neon.tech/db?sslmode=require&pgbouncer=true`
  - Direct (untuk migration): `postgres://user:pass@direct.neon.tech/db?sslmode=require`

### 4.4. Migration
- Drizzle migration di CI/CD (bukan runtime).
- Migration reversible (up + down script).
- Test migration di staging dulu sebelum production.

---

## 5. Environment Variables

Lengkap di `.env.example`. Ringkas kritikal:

### 5.1. Wajib di Semua Env
| Var | Deskripsi |
|---|---|
| `DATABASE_URL` | Pooled connection string |
| `DATABASE_MIGRATION_URL` | Direct connection untuk migration |
| `JWT_SECRET` | Min 32 bytes, rotasi setahun |
| `NEXT_PUBLIC_APP_ENV` | dev / staging / production |
| `NEXT_PUBLIC_BASE_URL` | URL app |

### 5.2. Wajib Production
| Var | Deskripsi |
|---|---|
| `TWILIO_*` | 2FA WhatsApp OTP |
| `HMAC_KEY_ENCRYPTION` | QR anti-forgery |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob untuk PDF |
| `SENTRY_DSN` | Error tracking |
| `UPSTASH_REDIS_*` | Rate limit + idempotency cache |
| `RESEND_API_KEY` | Email (Fase 2+) |

### 5.3. Storage Secret
- Vercel: env vars di **Vercel Dashboard → Settings → Environment Variables**.
- Sensitive vars → tandai "Sensitive" (di-hide dari log).
- Rotasi: log rotation date, wajib rotasi kalau ada compromise.

### 5.4. Feature Flags
Bertingkat per fase:
- `FEATURE_WMS_INBOUND=true` — Fase 1
- `FEATURE_MOBILE_QR=false` — Fase 3
- `FEATURE_WMS_OUTBOUND=false` — Fase 5
- `FEATURE_DISPATCH=false` — Fase 6

Flag disimpan di env vars (bukan DB) supaya bisa toggle per environment tanpa DB write.

---

## 6. Domain & DNS

- Production: `mes.hummer.example` (ganti sesuai domain real).
- Staging: `staging.mes.hummer.example`.
- API: sub-path `/api/v1/*` (bukan sub-domain).
- SSL: managed Vercel (Let's Encrypt), auto-renewal.
- HSTS: enabled, `max-age=31536000; includeSubDomains; preload`.

---

## 7. CI/CD Pipeline (GitHub Actions)

File: `.github/workflows/ci.yml` (belum dibuat, template):

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: mes_user
          POSTGRES_PASSWORD: mes_pass
          POSTGRES_DB: mes_test
        ports: [5432:5432]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm db:migrate
      - run: pnpm test
        env:
          DATABASE_URL: postgres://mes_user:mes_pass@localhost:5432/mes_test
```

### 7.1. Deploy
- **Preview**: setiap PR → Vercel preview URL otomatis.
- **Staging**: merge ke `main` → auto-deploy ke staging.
- **Production**: manual promote via Vercel Dashboard atau `vercel promote`.

### 7.2. Migration Deploy
- Migration jalan sebagai step CI **sebelum** deploy.
- Kalau migration fail → block deploy.
- Migration destructive (drop column) butuh manual approval.

---

## 8. Deploy ke Production — Prosedur

### 8.1. Pre-Deploy Checklist
- [ ] Semua PR relevan sudah merged ke `main`.
- [ ] Test CI green.
- [ ] Migration test di staging sukses.
- [ ] Changelog updated.
- [ ] Notify tim (WhatsApp/Slack).
- [ ] Backup DB terakhir < 24 jam (verify di Neon dashboard).

### 8.2. Deploy
1. Vercel Dashboard → Deployments → find latest staging → **Promote to Production**.
2. Tunggu build (~2-3 menit).
3. Verify URL production alive (curl `/api/v1/health`).

### 8.3. Post-Deploy
- [ ] Monitor Sentry 30 menit (error rate < 0.1%).
- [ ] Cek dashboard Vercel Analytics untuk anomali.
- [ ] Test smoke: login → view shift → logout.
- [ ] Notify tim: "Deploy vX.Y.Z sukses".

### 8.4. Rollback
Kalau incident:
1. Vercel Dashboard → **Instant Rollback** ke deploy sebelumnya.
2. Kalau migration destructive → rollback DB manual (lihat `docs/18-backup-recovery.md`).
3. Buat incident post-mortem dalam 5 hari.

---

## 9. Third-Party Integrations

### 9.1. Twilio (2FA)
- Account: Twilio Business (bukan Personal).
- Service: WhatsApp Business API sandbox (dev), production number (prod).
- Cost: ~$0.005 per message (Indonesia).

### 9.2. Sentry
- Plan: Business (untuk 30+ pabrik traffic).
- Alert rules:
  - Error rate > 1% dalam 5 menit → notify on-call.
  - New error class → notify tim dev.

### 9.3. Upstash Redis
- Plan: Pro (untuk rate limit persistent).
- Region: Singapore.

### 9.4. FCM / APNs (Fase 3+)
- Firebase project: `mes-hummer-mobile`.
- APNs certificate: managed di Firebase.

---

## 10. Cost Estimate (Bulanan)

| Item | Dev | Staging | Production (Fase 1) | Production (Fase 4+, 30 pabrik) |
|---|---|---|---|---|
| Vercel (Pro) | $20 | $20 | $20 (per member) | $200+ |
| Neon Postgres | free | $19 | $50 | $200 |
| Upstash Redis | free | free | $10 | $50 |
| Vercel Blob | free | $1 | $5 | $30 |
| Sentry Business | — | — | $80 | $80 |
| Twilio | — | — | $10 (est) | $50 |
| **Total** | ~$20 | ~$40 | **~$175** | **~$610** |

Note: harga estimasi 2026. Update sesuai contract aktual.

---

## 11. Referensi

- [`03-architecture.md`](./03-architecture.md) — ADR & C4 diagram.
- [`04-data-model.md`](./04-data-model.md) — skema DB.
- [`16-observability.md`](./16-observability.md) — monitoring detail.
- [`17-operations-runbook.md`](./17-operations-runbook.md) — incident procedure.
- [`18-backup-recovery.md`](./18-backup-recovery.md) — backup + DR.
- [`SECURITY.md`](../SECURITY.md) — security policy.
