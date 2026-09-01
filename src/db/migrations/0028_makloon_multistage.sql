-- =============================================================================
-- 0028 — Makloon multi-stage (docs/25 §4): entry & exit stage
-- =============================================================================
-- Order makloon bisa masuk di stage mana pun (batangan / pack / pack terwrap /
-- slop / bal) dan keluar di stage mana pun. Batch tetap unit pelacak rantai;
-- batch.stage di-set sesuai entry stage saat approve. Satuan entry mengikuti
-- stage (batangan = kg, sisanya = satuan stage).
-- =============================================================================

ALTER TABLE external_batangan_receiving
  ADD COLUMN IF NOT EXISTS entry_stage text NOT NULL DEFAULT 'BATANGAN';
-- BATANGAN | PACK | PACK_WRAPPED | SLOP | BAL

ALTER TABLE external_batangan_receiving
  ADD COLUMN IF NOT EXISTS entry_unit text NOT NULL DEFAULT 'KG';
-- KG | PACK | SLOP | BAL

ALTER TABLE external_pack_out
  ADD COLUMN IF NOT EXISTS exit_stage text NOT NULL DEFAULT 'PACK';
-- PACK | PACK_WRAPPED | SLOP | BAL (satuan keluar mengikuti entry batch)
