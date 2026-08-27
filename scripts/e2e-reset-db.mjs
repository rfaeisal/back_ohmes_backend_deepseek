#!/usr/bin/env node
// e2e-reset-db.mjs — Reset database E2E Playwright.
// Urutan: drop mes_e2e → create → drizzle migrate (0000–0012) →
// migrasi manual (0013–0019, idempotent) → seed.
// Sama dengan scripts/entrypoint.sh (migrate → manual → seed).
// DB harus ada SEBELUM server E2E boot (instrumentation.ts konek DB saat boot),
// karena itu dipanggil sebagai step pertama `pnpm test:e2e`, bukan globalSetup.
//
// Bypass: E2E_SKIP_RESET=1 — pakai DB & state yang sudah ada (mode iterasi).

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const CONTAINER = "mes_dev_postgres";
const DB = "mes_e2e";
const ADMIN_URL = `postgres://mes_user:mes_pass@localhost:5433/${DB}`;

if (process.env.E2E_SKIP_RESET) {
  console.log("[e2e-reset-db] E2E_SKIP_RESET=1 — lewati reset DB.");
  process.exit(0);
}

function run(cmd, env = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
}

// State antar spec dihapus — chain harus mulai dari spec 01
rmSync(join(process.cwd(), ".e2e"), { recursive: true, force: true });

try {
  run(`docker exec ${CONTAINER} dropdb -U mes_user --if-exists ${DB}`);
  run(`docker exec ${CONTAINER} createdb -U mes_user ${DB}`);
} catch {
  console.error(
    `\n❌ [e2e-reset-db] Gagal akses docker. Pastikan container '${CONTAINER}' jalan:\n` +
      "   docker compose -f docker-compose.dev.yml up -d"
  );
  process.exit(1);
}

// Migrasi drizzle (journal 0000–0012) — pakai role admin (RLS fail-closed kalau mes_app)
run("pnpm db:migrate", {
  DATABASE_URL_ADMIN: ADMIN_URL,
  DATABASE_MIGRATION_URL: ADMIN_URL,
});

// Migrasi manual 0013–0019 (idempotent; grant mes_app per-DB ada di sini)
run("node scripts/apply-manual-migrations.mjs", {
  DATABASE_MIGRATION_URL: ADMIN_URL,
});

// Seed idempotent (run-seed.ts memaksa DATABASE_URL = DATABASE_URL_ADMIN)
run("pnpm db:seed", {
  DATABASE_URL_ADMIN: ADMIN_URL,
  DATABASE_URL: ADMIN_URL,
  SUPERADMIN_DEFAULT_PASSWORD:
    process.env.E2E_ADMIN_PASSWORD ?? "admin_e2e_12345",
});

console.log(`\n✅ [e2e-reset-db] DB '${DB}' siap. Runtime: mes_app @ localhost:5433/${DB}`);
