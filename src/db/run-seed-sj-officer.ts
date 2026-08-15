// =============================================================================
// Wrapper Seed SJ Officer — jalankan dengan role ADMIN (superuser).
// =============================================================================
// Lihat run-seed.ts — alasan sama: seed butuh akses penuh, runtime app memakai
// role non-superuser (mes_app) supaya RLS aktif.
// =============================================================================

process.env.DATABASE_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL!;

import("./seed-sj-officer").catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exitCode = 1;
});
