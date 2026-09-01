-- =============================================================================
-- 0023 — Tambah nilai enum WASTE di material_out_type
-- =============================================================================
-- Waste material = material terbuang saat proses produksi (bukan rusak di
-- gudang — itu RUSAK). Desain docs/23 §3. WAJIB file terpisah (satu
-- statement): ALTER TYPE ADD VALUE tidak boleh dalam transaction block —
-- pola 0016/0017.
-- =============================================================================

ALTER TYPE material_out_type ADD VALUE IF NOT EXISTS 'WASTE' AFTER 'RUSAK';
