// =============================================================================
// Alter Role mes_app — ganti password role runtime dari env saat deploy
// =============================================================================
// Migrasi 0008 membuat role mes_app dengan password hardcoded. Script ini
// menggantinya dengan nilai dari MES_APP_DB_PASSWORD (env Coolify) memakai
// koneksi superuser DATABASE_MIGRATION_URL. Dipanggil dari entrypoint.sh.
// =============================================================================

import postgres from "postgres";

const adminUrl = process.env.DATABASE_MIGRATION_URL;
const newPassword = process.env.MES_APP_DB_PASSWORD;

if (!adminUrl) {
  console.error("[alter-app-role] DATABASE_MIGRATION_URL tidak di-set.");
  process.exit(1);
}
if (!newPassword || newPassword.length < 8) {
  console.error("[alter-app-role] MES_APP_DB_PASSWORD wajib (min 8 karakter).");
  process.exit(1);
}

const sql = postgres(adminUrl, { max: 1, connect_timeout: 15 });

try {
  const escaped = newPassword.replace(/'/g, "''");
  await sql.unsafe(`ALTER ROLE mes_app WITH LOGIN PASSWORD '${escaped}'`);
  console.log("[alter-app-role] Password role mes_app diperbarui.");
} finally {
  await sql.end();
}
