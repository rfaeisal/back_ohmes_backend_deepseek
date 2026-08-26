-- =============================================================================
-- 0016 — Tambah nilai enum PEMAKAIAN di material_out_type
-- =============================================================================
-- WAJIB file terpisah (satu statement): ALTER TYPE ADD VALUE tidak boleh
-- berjalan di dalam transaction block — apply-manual-migrations.mjs
-- mengeksekusi multi-statement dalam satu batch (implicit transaction).
-- Sisa DDL ada di 0017.
-- =============================================================================

ALTER TYPE material_out_type ADD VALUE IF NOT EXISTS 'PEMAKAIAN' AFTER 'RETUR';
