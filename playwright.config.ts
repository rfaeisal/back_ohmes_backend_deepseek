import { defineConfig, devices } from "@playwright/test";

// Suite E2E — rantai bisnis penuh (receiving → shift → approve → HLP →
// outbound → dispatch → transfer/retur). Spec berurutan (workers: 1) dan
// state mengalir antar spec via .e2e/e2e-state.json (helpers/state.ts).
// Jalankan via `pnpm test:e2e` (reset DB otomatis), bukan playwright test
// langsung — lihat CLAUDE.md seksi E2E.

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DB = "mes_e2e";
// Lokal: postgres dev di host 5433. CI: override lewat env (service postgres 5432)
const RUNTIME_DB_URL =
  process.env.E2E_DATABASE_URL ??
  `postgres://mes_app:mes_app_pass@localhost:5433/${E2E_DB}`;
const ADMIN_DB_URL =
  process.env.E2E_ADMIN_DATABASE_URL ??
  `postgres://mes_user:mes_pass@localhost:5433/${E2E_DB}`;

export default defineConfig({
  testDir: "tests/e2e",
  // next build (NEXT_DIST_DIR) menulis ulang next-env.d.ts/tsconfig.json —
  // teardown mengembalikannya ke versi git setelah suite selesai
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1, // chain antar spec — WAJIB 1 worker
  retries: 0, // deterministik; ulang = run baru (DB fresh)
  timeout: 90_000, // mesin dev lambat
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "id-ID",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build dijalankan sekali per run (ke .next-e2e, TIDAK menyentuh .next
    // milik dev server — lihat next.config.ts distDir). E2E_SKIP_BUILD=1
    // untuk iterasi cepat (syarat: build .next-e2e sudah ada).
    command: process.env.E2E_SKIP_BUILD
      ? `next start -p ${PORT}`
      : `next build && next start -p ${PORT}`,
    url: `${BASE_URL}/api/v1/health`, // public endpoint, 200
    timeout: 300_000, // build ~1–3 menit
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: RUNTIME_DB_URL,
      DATABASE_URL_ADMIN: ADMIN_DB_URL,
      DATABASE_MIGRATION_URL: ADMIN_DB_URL,
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_ENV: "development", // OTP bypass "000000"
      NEXT_PUBLIC_BASE_URL: BASE_URL,
      CORS_ORIGINS: `https://ohmes.fzdev.my.id,http://localhost:3000,${BASE_URL}`,
      SUPERADMIN_DEFAULT_PASSWORD:
        process.env.E2E_ADMIN_PASSWORD ?? "admin_e2e_12345",
    },
  },
});
