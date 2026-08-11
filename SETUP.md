# SETUP.md — Local Development Environment

Panduan set up local dev untuk kontribusi ke repo ini. Ditujukan developer baru yang baru clone repo.

**Waktu setup pertama kali**: ~30 menit (kalau tools sudah ada).

---

## 1. Prasyarat Sistem

| Tool | Versi | Cek |
|---|---|---|
| **Node.js** | 20 LTS+ | `node --version` |
| **pnpm** | 9+ | `pnpm --version` |
| **Docker** | latest | `docker --version` (untuk PostgreSQL lokal) |
| **Git** | 2.30+ | `git --version` |
| **VSCode / editor** | — | recommended: VSCode dengan TypeScript + Tailwind + Drizzle extensions |

Install tools kalau belum ada:
- Node.js: gunakan [nvm](https://github.com/nvm-sh/nvm) atau [fnm](https://github.com/Schniz/fnm).
- pnpm: `npm install -g pnpm`.
- Docker Desktop: [docker.com](https://www.docker.com/products/docker-desktop).

---

## 2. Clone Repo

```bash
git clone git@github.com:rfaeisal/back_ohmes_backend.git
cd back_ohmes_backend
```

---

## 3. Environment Variables

Copy template dan isi sesuai environment:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Database
DATABASE_URL=postgres://mes_user:mes_pass@localhost:5432/mes_dev

# Auth
JWT_SECRET=(generate: openssl rand -hex 32)
JWT_ACCESS_TOKEN_TTL_MINUTES=15
JWT_REFRESH_TOKEN_TTL_DAYS=30

# 2FA (dev: bisa dummy, prod: Twilio API)
TWILIO_ACCOUNT_SID=(kosongkan untuk dev)
TWILIO_AUTH_TOKEN=(kosongkan untuk dev)
TWILIO_WA_FROM=(kosongkan untuk dev)

# App
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Debug
DEBUG=false
LOG_LEVEL=debug
```

**Jangan commit `.env`** — sudah di-gitignore.

Detail semua env vars: [`docs/14-deployment-infra.md`](./docs/14-deployment-infra.md) §5.

---

## 4. Start PostgreSQL Lokal (Docker)

Buat `docker-compose.dev.yml` di root (kalau belum ada — akan disiapkan di Fase 0):

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: mes_user
      POSTGRES_PASSWORD: mes_pass
      POSTGRES_DB: mes_dev
    ports:
      - "5432:5432"
    volumes:
      - mes_pgdata:/var/lib/postgresql/data
volumes:
  mes_pgdata:
```

Jalankan:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Cek connected:

```bash
docker exec -it mes_dev_postgres psql -U mes_user -d mes_dev -c "SELECT version();"
```

---

## 5. Install Dependencies

```bash
pnpm install
```

---

## 6. Database Setup

Jalankan migrasi Drizzle:

```bash
pnpm db:migrate
```

Seed data awal (1 company, 1 region, 1 plant pilot, 3 machine, 1 product, 3 shift template, 3 supplier contoh):

```bash
pnpm db:seed
```

Bootstrap SUPERADMIN pertama (CLI script — bukan UI):

```bash
pnpm seed:superadmin --username admin --email admin@hummer.example
```

Password akan di-print sekali di terminal — **simpan baik-baik**, hanya muncul sekali.

---

## 7. Jalankan Dev Server

```bash
pnpm dev
```

Buka [http://localhost:3000](http://localhost:3000).

Login dengan SUPERADMIN yang baru dibuat.

---

## 8. Verifikasi Setup

Cek semua bekerja:

- [ ] Login SUPERADMIN sukses, 2FA prompt (dev: skip / accept dummy OTP).
- [ ] Halaman master data terbuka (Product, Machine, ShiftTemplate).
- [ ] API `/api/v1/auth/me` return user info.
- [ ] Test run: `pnpm test` — semua hijau.
- [ ] Type check: `pnpm typecheck` — 0 error.
- [ ] Lint: `pnpm lint` — 0 warning.

Kalau ada yang gagal, cek [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md) §Troubleshooting Common Setup Issues.

---

## 9. Development Workflow

### Buat Branch
```bash
git checkout -b feature/nama-fitur
# atau
git checkout -b fix/deskripsi-bug
```

### Sebelum Commit
```bash
pnpm lint        # ESLint auto-fix
pnpm typecheck   # TypeScript strict check
pnpm test        # Unit + integration test
```

### Commit
Ikuti [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` fitur baru
- `fix:` bugfix
- `docs:` dokumentasi
- `refactor:` refactor tanpa perubahan behavior
- `test:` tambah/perbaiki test
- `chore:` maintenance

Detail: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Push & PR
```bash
git push -u origin feature/nama-fitur
gh pr create
```

CI akan jalankan build + test + typecheck otomatis.

---

## 10. Perintah Berguna

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Start Next.js dev server (port 3000) |
| `pnpm build` | Production build |
| `pnpm start` | Production server (setelah build) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Unit + integration test |
| `pnpm test:e2e` | E2E test (Playwright) |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:migrate:generate` | Generate migration dari schema change |
| `pnpm db:seed` | Seed data awal |
| `pnpm db:studio` | Buka Drizzle Studio (visual DB browser) |
| `pnpm seed:superadmin` | Bootstrap SUPERADMIN via CLI |

---

## 11. Troubleshooting Cepat

**Port 3000 sudah dipakai**:
```bash
lsof -i :3000
kill -9 <PID>
```

**Docker postgres tidak start**:
```bash
docker compose -f docker-compose.dev.yml down
docker volume rm mes_pgdata  # hati-hati, hapus data
docker compose -f docker-compose.dev.yml up -d
```

**Migration error**:
```bash
pnpm db:migrate:reset  # DEV ONLY — hapus semua data + re-migrate
pnpm db:seed
```

**Test gagal karena RLS**:
Test harus set session variable `app.current_plant_ids` sebelum query. Cek helper `withScope()` di `src/db/test-utils.ts`.

**Isu lain**: [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md).

---

## 12. Referensi

- [`README.md`](./README.md) — overview repo
- [`CLAUDE.md`](./CLAUDE.md) — konvensi & aturan wajib
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — cara kontribusi
- [`docs/03-architecture.md`](./docs/03-architecture.md) — arsitektur
- [`docs/04-data-model.md`](./docs/04-data-model.md) — skema data
- [`docs/14-deployment-infra.md`](./docs/14-deployment-infra.md) — deployment production
- [`docs/15-testing-strategy.md`](./docs/15-testing-strategy.md) — testing overall
