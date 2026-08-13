# SETUP.md — Local Development Environment

**Status**: Fase 0–6 Complete · 22 halaman UI · 60+ API endpoint

---

## 1. Prasyarat

| Tool | Versi | Cek |
|---|---|---|
| Node.js | 20 LTS+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Docker | latest | `docker --version` |
| Git | 2.30+ | `git --version` |

---

## 2. Clone & Setup

```bash
git clone git@github.com:rfaeisal/back_ohmes_backend_deepseek.git
cd back_ohmes_backend_deepseek
cp .env.example .env
```

---

## 3. Start PostgreSQL

```bash
docker compose -f docker-compose.dev.yml up -d
```

Port: `5433` (hindari konflik dengan PostgreSQL lain)

---

## 4. Install & Migrate

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
```

---

## 5. Bootstrap SUPERADMIN

```bash
pnpm seed:superadmin --username admin --email admin@hummer.example
```

Password muncul sekali — simpan.

---

## 6. Jalankan Dev Server

```bash
pnpm dev
# → http://localhost:3001
```

---

## 7. Verifikasi

- `GET http://localhost:3001/api/v1/health` → 200 OK
- Login: `POST /api/v1/auth/login` dengan admin / password / OTP `000000`
- Buka `/tablet` untuk tablet UI, `/admin` untuk admin dashboard

---

## 8. Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| DATABASE_URL | `postgres://mes_user:mes_pass@localhost:5433/mes_dev` | Dev database |
| JWT_SECRET | (generate) | `openssl rand -hex 32` |
| NEXT_PUBLIC_APP_ENV | `development` | `development` \| `production` |
| OTP_BYPASS_CODE | (kosong) | Set `000000` untuk skip 2FA |
| HMAC_KEY_ENCRYPTION | (generate) | Untuk QR anti-forgery |

---

## 9. Test Users

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
| erik.koordinator | 12345678 | AREA_COORDINATOR |
| hqadmin | 12345678 | HQ_ADMIN |
| hqanalyst | 12345678 | HQ_ANALYST |
| hqauditor | 12345678 | HQ_AUDITOR |

---

## 10. Commands

| Command | Fungsi |
|---|---|
| `pnpm dev` | Dev server (port 3001) |
| `pnpm build` | Production build |
| `pnpm test` | Unit + integration tests |
| `pnpm typecheck` | TypeScript strict check |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Seed data (idempotent) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm deploy:setup` | migrate + seed (untuk Coolify/Vercel) |

---

## 11. Deploy

**Vercel + Neon:**
1. Provision PostgreSQL 16 di neon.tech
2. Deploy repo ke Vercel
3. Env vars: `DATABASE_URL`, `JWT_SECRET`, `OTP_BYPASS_CODE=000000`, `HMAC_KEY_ENCRYPTION`
4. Post-deploy: `pnpm deploy:setup`
