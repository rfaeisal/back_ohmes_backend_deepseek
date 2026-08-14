-- =============================================================================
-- 0004 — TSG Box Session: buka 1–6 boks sekaligus + timbang batangan kolektif
-- =============================================================================

CREATE TABLE IF NOT EXISTS "tsg_box_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_report_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"batch_id" uuid,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"total_batangan_kg" numeric(10, 2),
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"weighed_at" timestamp
);

ALTER TABLE "tsg_box_session" ADD CONSTRAINT "tsg_box_session_shift_report_id_shift_report_id_fk"
	FOREIGN KEY ("shift_report_id") REFERENCES "shift_report"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tsg_box_session" ADD CONSTRAINT "tsg_box_session_plant_id_plant_id_fk"
	FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "tsg_box_session" ADD CONSTRAINT "tsg_box_session_batch_id_batch_id_fk"
	FOREIGN KEY ("batch_id") REFERENCES "batch"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_box_session_active" ON "tsg_box_session" ("shift_report_id") WHERE status = 'OPEN';

-- Kolom session di tsg_box_process
ALTER TABLE "tsg_box_process" ADD COLUMN IF NOT EXISTS "session_id" uuid;
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'tsg_box_process_session_id_tsg_box_session_id_fk'
	) THEN
		ALTER TABLE "tsg_box_process" ADD CONSTRAINT "tsg_box_process_session_id_tsg_box_session_id_fk"
			FOREIGN KEY ("session_id") REFERENCES "tsg_box_session"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_box_process_session" ON "tsg_box_process" ("session_id");

-- =============================================================================
-- RLS — sesi boks (konsisten dengan tabel operasional lain)
-- =============================================================================

ALTER TABLE "tsg_box_session" ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_bsession_select ON "tsg_box_session" FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_bsession_insert ON "tsg_box_session" FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_bsession_update ON "tsg_box_session" FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_bsession_delete ON "tsg_box_session" FOR DELETE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
