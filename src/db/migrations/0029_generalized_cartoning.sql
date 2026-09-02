-- 0029 — Generalisasi karton multi-satuan: PACK (HLP / hasil WR), SLOP, BAL
-- + finished_goods_receiving per unit. Idempotent (di-run tiap deploy).
-- Unique lama carton_content (carton_id, hlp_pack_id) dipertahankan: NULL
-- hlp_pack_id lolos constraint unik, jadi baris STAGE tidak menabraknya.

-- ---------------------------------------------------------------------------
-- carton.unit
-- ---------------------------------------------------------------------------
ALTER TABLE carton ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'PACK';
ALTER TABLE carton DROP CONSTRAINT IF EXISTS ck_carton_unit;
ALTER TABLE carton ADD CONSTRAINT ck_carton_unit CHECK (unit IN ('PACK', 'SLOP', 'BAL'));

-- ---------------------------------------------------------------------------
-- carton_content: source polymorphic (HLP_PACK | STAGE)
-- ---------------------------------------------------------------------------
ALTER TABLE carton_content ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'HLP_PACK';
ALTER TABLE carton_content ALTER COLUMN hlp_pack_id DROP NOT NULL;
ALTER TABLE carton_content ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES batch(id);
ALTER TABLE carton_content ADD COLUMN IF NOT EXISTS stage text;

ALTER TABLE carton_content DROP CONSTRAINT IF EXISTS ck_content_source_type;
ALTER TABLE carton_content ADD CONSTRAINT ck_content_source_type CHECK (source_type IN ('HLP_PACK', 'STAGE'));

ALTER TABLE carton_content DROP CONSTRAINT IF EXISTS ck_content_stage;
ALTER TABLE carton_content ADD CONSTRAINT ck_content_stage CHECK (stage IS NULL OR stage IN ('WR', 'SLOP', 'BAL'));

ALTER TABLE carton_content DROP CONSTRAINT IF EXISTS ck_content_shape;
ALTER TABLE carton_content ADD CONSTRAINT ck_content_shape CHECK (
  (source_type = 'HLP_PACK' AND hlp_pack_id IS NOT NULL AND batch_id IS NULL AND stage IS NULL)
  OR
  (source_type = 'STAGE' AND hlp_pack_id IS NULL AND batch_id IS NOT NULL AND stage IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_carton_content_stage
  ON carton_content (carton_id, batch_id, stage) WHERE source_type = 'STAGE';
CREATE INDEX IF NOT EXISTS idx_content_batch_stage
  ON carton_content (batch_id, stage);

-- ---------------------------------------------------------------------------
-- Policy UPDATE carton_content (upsert Isi Karton via role mes_app)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS p_cc_update ON carton_content;
CREATE POLICY p_cc_update ON carton_content
  FOR UPDATE
  USING (
    plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- finished_goods_receiving per unit (unique shift + unit)
-- ---------------------------------------------------------------------------
ALTER TABLE finished_goods_receiving ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'PACK';
ALTER TABLE finished_goods_receiving DROP CONSTRAINT IF EXISTS ck_fgr_unit;
ALTER TABLE finished_goods_receiving ADD CONSTRAINT ck_fgr_unit CHECK (unit IN ('PACK', 'SLOP', 'BAL'));

ALTER TABLE finished_goods_receiving DROP CONSTRAINT IF EXISTS finished_goods_receiving_shift_report_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fgr_shift_unit ON finished_goods_receiving (shift_report_id, unit);
