#!/bin/sh
# =============================================================================
# Entrypoint produksi — self-migrating deploy (Coolify / Docker)
# =============================================================================
# Urutan saat container start:
#   1. Migrasi Drizzle (via DATABASE_MIGRATION_URL — role superuser)
#   2. Ganti password role mes_app (kalau MES_APP_DB_PASSWORD di-set)
#   3. Seed idempotent (skip kalau sudah ada)
#   4. Start Next.js (DATABASE_URL = role mes_app non-superuser → RLS aktif)
# =============================================================================
set -e

# drizzle-kit & tsx butuh HOME writable; container image tidak punya home user
export HOME=/tmp

echo "[entrypoint] Menjalankan migrasi database..."
node node_modules/drizzle-kit/bin.cjs migrate --config ./drizzle.config.ts

echo "[entrypoint] Menerapkan migrasi manual di luar journal drizzle..."
node /app/apply-manual-migrations.mjs

if [ -n "$MES_APP_DB_PASSWORD" ]; then
  echo "[entrypoint] Mengganti password role mes_app (dari MES_APP_DB_PASSWORD)..."
  node /app/alter-app-role.mjs
fi

# Seed memakai role admin (superuser) supaya RLS tidak menghalangi
export DATABASE_URL_ADMIN="${DATABASE_MIGRATION_URL}"

echo "[entrypoint] Seed data (idempotent)..."
node node_modules/tsx/dist/cli.mjs src/db/run-seed.ts
node node_modules/tsx/dist/cli.mjs src/db/run-seed-sj-officer.ts

echo "[entrypoint] Menjalankan server Next.js..."
exec node server.js
