-- 0030 — batch.target_unit: produk jadi target per batch (diputuskan di HLP)
-- PACK | PACK_WRAP | SLOP | BAL — menentukan rantai stage yang wajib dilalui.
-- Idempotent (di-run tiap deploy).

ALTER TABLE batch ADD COLUMN IF NOT EXISTS target_unit text NOT NULL DEFAULT 'PACK';
ALTER TABLE batch DROP CONSTRAINT IF EXISTS ck_batch_target_unit;
ALTER TABLE batch ADD CONSTRAINT ck_batch_target_unit CHECK (target_unit IN ('PACK', 'PACK_WRAP', 'SLOP', 'BAL'));

-- Backfill legacy: batch yang sudah punya event stage jelas bukan target PACK.
-- Stabil & idempotent — setelah ini target tidak bisa diubah lagi (sudah ada event).
UPDATE batch SET target_unit = 'BAL'
WHERE target_unit = 'PACK'
  AND EXISTS (SELECT 1 FROM batch_stage_event bse WHERE bse.batch_id = batch.id);
