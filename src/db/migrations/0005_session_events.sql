-- =============================================================================
-- 0005 — Event level sesi: pemakaian, downtime, maintenance tanpa per-boks
-- =============================================================================

-- tsg_box_consumption: boks jadi opsional, tambah session_id
ALTER TABLE "tsg_box_consumption" ALTER COLUMN "tsg_box_id" DROP NOT NULL;
ALTER TABLE "tsg_box_consumption" ADD COLUMN IF NOT EXISTS "session_id" uuid;
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'tsg_box_consumption_session_id_tsg_box_session_id_fk'
	) THEN
		ALTER TABLE "tsg_box_consumption" ADD CONSTRAINT "tsg_box_consumption_session_id_tsg_box_session_id_fk"
			FOREIGN KEY ("session_id") REFERENCES "tsg_box_session"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;

-- downtime_log: tambah session_id
ALTER TABLE "downtime_log" ADD COLUMN IF NOT EXISTS "session_id" uuid;
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'downtime_log_session_id_tsg_box_session_id_fk'
	) THEN
		ALTER TABLE "downtime_log" ADD CONSTRAINT "downtime_log_session_id_tsg_box_session_id_fk"
			FOREIGN KEY ("session_id") REFERENCES "tsg_box_session"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;

-- maintenance_event: tambah session_id
ALTER TABLE "maintenance_event" ADD COLUMN IF NOT EXISTS "session_id" uuid;
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_event_session_id_tsg_box_session_id_fk'
	) THEN
		ALTER TABLE "maintenance_event" ADD CONSTRAINT "maintenance_event_session_id_tsg_box_session_id_fk"
			FOREIGN KEY ("session_id") REFERENCES "tsg_box_session"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_cons_session" ON "tsg_box_consumption" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_dl_session" ON "downtime_log" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_mt_session" ON "maintenance_event" ("session_id");
