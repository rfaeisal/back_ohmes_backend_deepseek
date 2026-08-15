-- =============================================================================
-- 0006 — Surat Jalan Supplier: pre-labeling & pre-weighing di gudang supplier
--       + approval receiving manual tanpa SJ
-- =============================================================================

CREATE TYPE "supplier_sj_status" AS ENUM ('DRAFT', 'SHIPPED', 'RECEIVED');

CREATE TABLE IF NOT EXISTS "supplier_sj" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sj_number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"status" "supplier_sj_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"shipped_at" timestamp,
	"received_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "supplier_sj_supplier_id_sj_number_unique" UNIQUE ("supplier_id", "sj_number")
);

ALTER TABLE "supplier_sj" ADD CONSTRAINT "supplier_sj_supplier_id_tsg_supplier_id_fk"
	FOREIGN KEY ("supplier_id") REFERENCES "tsg_supplier"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "supplier_sj" ADD CONSTRAINT "supplier_sj_plant_id_plant_id_fk"
	FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "supplier_sj" ADD CONSTRAINT "supplier_sj_created_by_user_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_supplier_sj_plant" ON "supplier_sj" ("plant_id");
CREATE INDEX IF NOT EXISTS "idx_supplier_sj_status" ON "supplier_sj" ("status");

CREATE TABLE IF NOT EXISTS "supplier_sj_box" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_sj_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"box_code" text NOT NULL,
	"tsg_type" "tsg_type" NOT NULL,
	"supplier_weight_kg" numeric(10, 2),
	"entered_by" uuid,
	"entered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "supplier_sj_box_box_code_unique" UNIQUE ("box_code")
);

ALTER TABLE "supplier_sj_box" ADD CONSTRAINT "supplier_sj_box_supplier_sj_id_supplier_sj_id_fk"
	FOREIGN KEY ("supplier_sj_id") REFERENCES "supplier_sj"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "supplier_sj_box" ADD CONSTRAINT "supplier_sj_box_plant_id_plant_id_fk"
	FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "supplier_sj_box" ADD CONSTRAINT "supplier_sj_box_entered_by_user_id_fk"
	FOREIGN KEY ("entered_by") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_sj_box_sj" ON "supplier_sj_box" ("supplier_sj_id");
CREATE INDEX IF NOT EXISTS "idx_sj_box_plant" ON "supplier_sj_box" ("plant_id");

-- Approval receiving manual (tanpa SJ)
ALTER TABLE "tsg_receiving" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'MANUAL' NOT NULL;
ALTER TABLE "tsg_receiving" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'APPROVED' NOT NULL;
ALTER TABLE "tsg_receiving" ADD COLUMN IF NOT EXISTS "approved_by" uuid;
ALTER TABLE "tsg_receiving" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'tsg_receiving_approved_by_user_id_fk'
	) THEN
		ALTER TABLE "tsg_receiving" ADD CONSTRAINT "tsg_receiving_approved_by_user_id_fk"
			FOREIGN KEY ("approved_by") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;

-- =============================================================================
-- RLS — Surat Jalan Supplier (filter per plant tujuan, konsisten tabel lain)
-- =============================================================================

ALTER TABLE "supplier_sj" ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_sj_select ON "supplier_sj" FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sj_insert ON "supplier_sj" FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sj_update ON "supplier_sj" FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sj_delete ON "supplier_sj" FOR DELETE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE "supplier_sj_box" ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_sjb_select ON "supplier_sj_box" FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sjb_insert ON "supplier_sj_box" FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sjb_update ON "supplier_sj_box" FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sjb_delete ON "supplier_sj_box" FOR DELETE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
