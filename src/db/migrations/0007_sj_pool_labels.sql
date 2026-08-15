-- =============================================================================
-- 0007 — Surat Jalan Supplier v1.1: Pool Label
--       Label generik dicetak di area office (belum terikat SJ), di-assign saat
--       scan di gudang supplier (scan = assign + jenis + berat).
-- =============================================================================

CREATE TYPE "supplier_sj_label_status" AS ENUM ('AVAILABLE', 'ASSIGNED', 'VOID');

-- Boks/label tidak lagi wajib terikat SJ sejak lahir (pool label)
ALTER TABLE "supplier_sj_box" ALTER COLUMN "supplier_sj_id" DROP NOT NULL;
-- Pool label belum punya pabrik tujuan (diisi saat assign ke SJ)
ALTER TABLE "supplier_sj_box" ALTER COLUMN "plant_id" DROP NOT NULL;
-- Jenis TSG diisi saat scan (centang kertas = alat bantu fisik, bukan data)
ALTER TABLE "supplier_sj_box" ALTER COLUMN "tsg_type" DROP NOT NULL;

ALTER TABLE "supplier_sj_box" ADD COLUMN IF NOT EXISTS "label_status" "supplier_sj_label_status" DEFAULT 'AVAILABLE' NOT NULL;
-- Pemilik pool label (untuk RLS: label belum terikat SJ hanya terlihat pembuatnya)
ALTER TABLE "supplier_sj_box" ADD COLUMN IF NOT EXISTS "created_by" uuid;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'supplier_sj_box_created_by_user_id_fk'
	) THEN
		ALTER TABLE "supplier_sj_box" ADD CONSTRAINT "supplier_sj_box_created_by_user_id_fk"
			FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_sj_box_label_status" ON "supplier_sj_box" ("label_status");
CREATE INDEX IF NOT EXISTS "idx_sj_box_created_by" ON "supplier_sj_box" ("created_by");

-- =============================================================================
-- RLS — pool label (plant_id NULL) hanya terlihat/terkelola pemiliknya
-- =============================================================================

DROP POLICY IF EXISTS p_sjb_select ON "supplier_sj_box";
CREATE POLICY p_sjb_select ON "supplier_sj_box" FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true'
         OR (plant_id IS NULL AND created_by = current_setting('app.current_user_id')::uuid));

DROP POLICY IF EXISTS p_sjb_insert ON "supplier_sj_box";
CREATE POLICY p_sjb_insert ON "supplier_sj_box" FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true'
              OR (plant_id IS NULL AND created_by = current_setting('app.current_user_id')::uuid));

DROP POLICY IF EXISTS p_sjb_update ON "supplier_sj_box";
CREATE POLICY p_sjb_update ON "supplier_sj_box" FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true'
         OR (plant_id IS NULL AND created_by = current_setting('app.current_user_id')::uuid));

DROP POLICY IF EXISTS p_sjb_delete ON "supplier_sj_box";
CREATE POLICY p_sjb_delete ON "supplier_sj_box" FOR DELETE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true'
         OR (plant_id IS NULL AND created_by = current_setting('app.current_user_id')::uuid));
