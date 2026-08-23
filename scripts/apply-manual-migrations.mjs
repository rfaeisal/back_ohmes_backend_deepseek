// =============================================================================
// Apply Manual Migrations — jalankan file .sql yang di luar journal drizzle
// =============================================================================
// Konteks: drizzle-kit hanya track migrasi yang ia generate sendiri
// (`_journal.json`). File .sql yang kita tambah manual di folder migrations/
// (RLS policies, DDL yang butuh sintaks di luar Drizzle, dsb) tidak ikut
// dijalankan oleh `drizzle-kit migrate`.
//
// Script ini bandingkan file .sql di disk dengan tag di journal → apply
// yang belum ada. Semua migrasi manual kita ditulis idempotent dengan
// IF NOT EXISTS / OR REPLACE, jadi aman di-rerun setiap deploy.
//
// Dipanggil dari entrypoint.sh setelah drizzle-kit migrate.
// =============================================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const adminUrl = process.env.DATABASE_MIGRATION_URL;
if (!adminUrl) {
  console.error(
    "[apply-manual-migrations] DATABASE_MIGRATION_URL tidak di-set."
  );
  process.exit(1);
}

// Cari folder migrations. Container produksi flatten script ke /app/
// (bukan /app/scripts/), jadi `../src/db/migrations` dari lokasi script
// resolve ke /src/db/migrations yang tidak ada. Kita coba beberapa kandidat.
function resolveMigrationsDir() {
  if (process.env.MANUAL_MIGRATIONS_DIR) return process.env.MANUAL_MIGRATIONS_DIR;
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(scriptDir, "..", "src", "db", "migrations"), // dev: /repo/scripts/ → /repo/src/db/migrations
    join(scriptDir, "src", "db", "migrations"),       // prod flat: /app/ → /app/src/db/migrations
    resolve(process.cwd(), "src", "db", "migrations"), // cwd fallback (WORKDIR /app)
  ];
  for (const p of candidates) {
    if (existsSync(join(p, "meta", "_journal.json"))) return p;
  }
  return candidates[candidates.length - 1]; // last resort — biar error message-nya jelas
}

const migrationsDir = resolveMigrationsDir();
console.log(`[apply-manual-migrations] Folder migrations: ${migrationsDir}`);

// Baca journal drizzle → set of tag yang sudah di-track
let trackedTags = new Set();
try {
  const journalRaw = readFileSync(
    join(migrationsDir, "meta", "_journal.json"),
    "utf8"
  );
  const journal = JSON.parse(journalRaw);
  trackedTags = new Set((journal.entries ?? []).map((e) => e.tag));
} catch (err) {
  console.warn(
    `[apply-manual-migrations] Journal drizzle tidak terbaca: ${err.message}. Semua .sql akan dianggap manual.`
  );
}

// Cari file .sql yang belum di-track
const allSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const manualFiles = allSql.filter((f) => !trackedTags.has(f.replace(/\.sql$/, "")));

if (manualFiles.length === 0) {
  console.log(
    "[apply-manual-migrations] Tidak ada migrasi manual di luar journal drizzle."
  );
  process.exit(0);
}

console.log(
  `[apply-manual-migrations] Ditemukan ${manualFiles.length} migrasi manual: ${manualFiles.join(", ")}`
);

const sql = postgres(adminUrl, { max: 1, connect_timeout: 30 });

try {
  for (const file of manualFiles) {
    const path = join(migrationsDir, file);
    const content = readFileSync(path, "utf8").trim();
    if (!content) {
      console.log(`[apply-manual-migrations] Skip ${file} (kosong).`);
      continue;
    }
    console.log(`[apply-manual-migrations] → apply ${file}`);
    // File kita idempotent (IF NOT EXISTS / OR REPLACE) → aman di-rerun tiap deploy.
    await sql.unsafe(content);
    console.log(`[apply-manual-migrations] ✓ ${file}`);
  }
  console.log("[apply-manual-migrations] Selesai.");
} catch (err) {
  console.error("[apply-manual-migrations] Gagal:", err);
  process.exit(1);
} finally {
  await sql.end();
}
