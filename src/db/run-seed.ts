// =============================================================================
// Wrapper Seed — jalankan dengan role ADMIN (superuser) supaya RLS di-bypass.
// =============================================================================
// Runtime app memakai role non-superuser (mes_app) via DATABASE_URL supaya RLS
// aktif. Script seed butuh akses penuh (insert lintas plant + identity tables),
// jadi koneksi dipaksa ke DATABASE_URL_ADMIN sebelum modul db di-import.
// =============================================================================

process.env.DATABASE_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL!;

import("./seed").catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exitCode = 1;
});
