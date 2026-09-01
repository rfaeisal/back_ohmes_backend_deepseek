-- =============================================================================
-- 0027 — Rantai produksi: batch.stage + catatan per-stage (docs/25)
-- =============================================================================
-- Tanpa sesi formal untuk WR/SLOP/BAL (rekomendasi disepakati §2): cukup
-- catatan per-stage — input/output/reject per satuan stage (pack/slop/bal),
-- urutan bebas (tidak divalidasi berurutan). Nilai enum mesin WR/SLOP/BAL
-- sudah ditambahkan di 0026.
-- =============================================================================

-- Progress batch: stage tertinggi yang sudah dicatat (PACKED awal)
ALTER TABLE batch
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'PACKED';

-- Catatan per-stage: 1 baris = 1 kegiatan selesai
CREATE TABLE IF NOT EXISTS batch_stage_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL REFERENCES batch(id),
  plant_id      uuid NOT NULL REFERENCES plant(id), -- RLS
  stage         text NOT NULL,                      -- WR | SLOP | BAL
  machine_id    uuid REFERENCES machine(id),        -- NULL kalau manual
  input_qty     numeric NOT NULL,
  output_qty    numeric NOT NULL,
  reject_qty    numeric NOT NULL DEFAULT 0,
  unit          text NOT NULL,                      -- PACK | SLOP | BAL
  operator_by   uuid NOT NULL REFERENCES "user"(id),
  event_at      timestamptz NOT NULL DEFAULT now(),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stage_event_batch ON batch_stage_event (batch_id, event_at);
CREATE INDEX IF NOT EXISTS idx_stage_event_plant ON batch_stage_event (plant_id, stage);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- batch: policy UPDATE belum ada di 0000 — stage harus bisa di-update app
DROP POLICY IF EXISTS p_batch_update ON batch;
CREATE POLICY p_batch_update ON batch FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE batch_stage_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_stage_event_select ON batch_stage_event;
CREATE POLICY p_stage_event_select ON batch_stage_event FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_stage_event_insert ON batch_stage_event;
CREATE POLICY p_stage_event_insert ON batch_stage_event FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_stage_event_update ON batch_stage_event;
CREATE POLICY p_stage_event_update ON batch_stage_event FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
