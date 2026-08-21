-- =============================================================================
-- 0009: Default untuk GUC RLS per-database
-- =============================================================================
-- RLS policies memakai current_setting('app.current_plant_ids') TANPA missing_ok
-- (lihat 0008_rls_app_role.sql). Akibatnya, koneksi baru yang belum pernah
-- SET session variable akan ERROR "unrecognized configuration parameter"
-- (guc.c find_option, SQLSTATE 42704) — terjadi pada server component yang
-- query DB langsung tanpa melewati withAuth (mis. /admin setelah pool idle 30s).
--
-- Fix: deklarasikan GUC dengan default per-database. Sekali di-set:
--   - koneksi baru tidak error lagi (current_setting mengembalikan default),
--   - default '{}' = fail closed (tidak ada plant yang terlihat sebelum
--     setRlsContext() dipanggil),
--   - RESET app.* kembali ke default, tidak error.
-- =============================================================================

DO $$
DECLARE
  db_name text := current_database();
BEGIN
  EXECUTE format('ALTER DATABASE %I SET app.current_plant_ids = %L', db_name, '{}');
  EXECUTE format('ALTER DATABASE %I SET app.current_user_id  = %L', db_name, '');
  EXECUTE format('ALTER DATABASE %I SET app.current_role_ids = %L', db_name, '{}');
  EXECUTE format('ALTER DATABASE %I SET app.bypass_rls      = %L', db_name, 'false');
END $$;
