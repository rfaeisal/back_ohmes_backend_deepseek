-- =============================================================================
-- 0008 — Role DB runtime non-superuser (fix RLS yang tidak pernah aktif)
-- =============================================================================
-- Sebelumnya app connect sebagai mes_user (SUPERUSER, rolbypassrls) sehingga
-- semua policy RLS dilewati. Role mes_app ini untuk runtime app:
--   - NOSUPERUSER + NOBYPASSRLS → RLS berlaku
--   - DML pada semua tabel publik (DDL tetap via mes_user / DATABASE_URL_ADMIN)
-- =============================================================================

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mes_app') THEN
		CREATE ROLE mes_app LOGIN PASSWORD 'mes_app_pass' NOSUPERUSER NOCREATEDB NOCREATEROLE;
	END IF;
END $$;

ALTER ROLE mes_app NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO mes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mes_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mes_app;

-- Objek baru yang dibuat role migrator (migrasi berikutnya) otomatis bisa
-- diakses mes_app. CURRENT_USER = role yang menjalankan migrasi: mes_user di
-- dev, mes_admin (Coolify) di production — jangan hardcode nama role.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
	GRANT USAGE, SELECT ON SEQUENCES TO mes_app;
