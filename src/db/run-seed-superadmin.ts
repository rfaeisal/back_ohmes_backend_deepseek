// =============================================================================
// Wrapper Seed SUPERADMIN — jalankan dengan role ADMIN (superuser).
// =============================================================================
// Lihat run-seed.ts — alasan sama. Argumen CLI (--username/--email) diteruskan
// apa adanya ke seed-superadmin.ts lewat process.argv.
// =============================================================================

process.env.DATABASE_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL!;

import("./seed-superadmin").catch((e) => {
  console.error("❌ Bootstrap failed:", e);
  process.exitCode = 1;
});
