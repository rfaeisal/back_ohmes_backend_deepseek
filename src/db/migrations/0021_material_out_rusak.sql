-- =============================================================================
-- 0021 — Tambah nilai enum RUSAK di material_out_type
-- =============================================================================
-- Kategori keluar baru: barang rusak di gudang (bukan transfer, retur, maupun
-- pemakaian produksi). WAJIB file terpisah (satu statement): ALTER TYPE
-- ADD VALUE tidak boleh berjalan dalam transaction block — lihat 0016/0017.
-- =============================================================================

ALTER TYPE material_out_type ADD VALUE IF NOT EXISTS 'RUSAK' AFTER 'PEMAKAIAN';
