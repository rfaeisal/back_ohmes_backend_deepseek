-- =============================================================================
-- 0019 — carton_content.pack_qty (temuan testing WMS Outbound, 27 Agu 2026)
-- =============================================================================
-- Sebelumnya 1 baris carton_content = 1 entri catatan packing (1 batch utuh,
-- bisa ribuan pack fisik) — tidak konsisten dengan kapasitas karton (pack
-- fisik). Sekarang baris menyimpan JUMLAH pack dari batch tsb yang masuk
-- karton (mis. 50 dari 1600).
-- =============================================================================

ALTER TABLE carton_content
  ADD COLUMN IF NOT EXISTS pack_qty INTEGER NOT NULL DEFAULT 1;
