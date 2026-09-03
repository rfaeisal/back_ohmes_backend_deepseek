-- 0032 — Catat Stage Rantai: rasio & sisa (3 Sep 2026)
-- batch_stage_event + isi_per_unit (rasio input per 1 output; SLOP: pack/slop,
-- BAL: slop/bal) dan sisa_qty (sisa input tidak terpakai — angka resmi karton).
ALTER TABLE batch_stage_event ADD COLUMN IF NOT EXISTS isi_per_unit integer;
ALTER TABLE batch_stage_event ADD COLUMN IF NOT EXISTS sisa_qty integer;
