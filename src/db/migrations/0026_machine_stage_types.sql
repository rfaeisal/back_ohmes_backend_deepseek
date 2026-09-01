-- =============================================================================
-- 0026 — Tambah tipe mesin rantai produksi: WR, SLOP, BAL (docs/25)
-- =============================================================================
-- HLP → WR (wrapping) → SLOP (+slop wrapping, 1 proses) → BAL (baling) →
-- karton manual. File ini HANYA berisi ALTER TYPE ADD VALUE (tanpa pemakaian
-- nilai baru dalam batch yang sama) — pola 0016. DDL lain di 0027.
-- =============================================================================

ALTER TYPE machine_type ADD VALUE IF NOT EXISTS 'WR' AFTER 'HLP';
ALTER TYPE machine_type ADD VALUE IF NOT EXISTS 'SLOP' AFTER 'WR';
ALTER TYPE machine_type ADD VALUE IF NOT EXISTS 'BAL' AFTER 'SLOP';
