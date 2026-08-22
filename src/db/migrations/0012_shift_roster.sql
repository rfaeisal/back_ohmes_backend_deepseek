-- =============================================================================
-- 0012 — shift_roster (tabel roster mingguan)
-- =============================================================================
-- Tabel ini sebelumnya dibuat manual di DB dev (tidak pernah masuk migrasi),
-- sehingga production 500: relation "shift_roster" does not exist saat
-- GET /api/v1/shift-roster. DDL mengikuti struktur dev (parity), kecuali
-- created_at memakai timestamptz supaya konsisten dengan tabel lain.
-- Migrasi idempotent supaya aman dijalankan di DB dev yang sudah punya tabel.
--
-- CATATAN (penyimpangan disengaja dari konvensi):
-- - Tanpa RLS: endpoint /api/v1/shift-roster memakai raw SQL dengan
--   allowBypassRls + permission shift.member.assign sebagai gate.
-- - Tanpa plant_id: roster melintasi user dari beberapa plant.
-- - Tanpa FK ke shift_role: POST punya fallback roleId hardcoded yang
--   belum tentu shift_role valid.
-- - Tanpa soft delete (deleted_at): endpoint memakai DELETE + INSERT hard.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "shift_roster" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "date" date NOT NULL,
  "shift_template_id" uuid NOT NULL,
  "shift_role_id" uuid NOT NULL,
  "week_start" date NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  CONSTRAINT "shift_roster_user_id_date_shift_template_id_key" UNIQUE ("user_id", "date", "shift_template_id")
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'shift_roster'::regclass AND c.contype = 'f' AND a.attname = 'user_id'
  ) THEN
    ALTER TABLE "shift_roster" ADD CONSTRAINT "shift_roster_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'shift_roster'::regclass AND c.contype = 'f' AND a.attname = 'shift_template_id'
  ) THEN
    ALTER TABLE "shift_roster" ADD CONSTRAINT "shift_roster_shift_template_id_shift_template_id_fk"
      FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_template"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shift_roster_week_start_idx" ON "shift_roster" ("week_start");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "shift_roster_user_id_idx" ON "shift_roster" ("user_id");
