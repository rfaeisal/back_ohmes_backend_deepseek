-- =============================================================================
-- 0017 — Pemakaian material per mesin (backlog HLP material, 26 Agu 2026)
-- =============================================================================
-- Alur disepakati: gudang input material keluar → mesin tujuan (mis. HLP-01),
-- operator mesin lihat read-only di halamannya. Consumable & sparepart diberi
-- penanda mesin berlaku (MAKER / HLP / BOTH) supaya form gudang hanya
-- menampilkan item yang relevan untuk mesin tujuan.
-- Nilai enum PEMAKAIAN sudah ditambahkan di 0016 (file terpisah).
-- =============================================================================

-- Mesin tujuan — wajib untuk out_type = PEMAKAIAN (NULL untuk transfer/retur)
ALTER TABLE material_out
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES machine(id);

-- Penanda mesin berlaku di master consumable & sparepart
ALTER TABLE consumable_item
  ADD COLUMN IF NOT EXISTS applicable_machines TEXT NOT NULL DEFAULT 'BOTH';

ALTER TABLE sparepart
  ADD COLUMN IF NOT EXISTS applicable_machines TEXT NOT NULL DEFAULT 'BOTH';

-- Index untuk panel "bahan di mesin ini"
CREATE INDEX IF NOT EXISTS idx_material_out_machine ON material_out (machine_id)
  WHERE machine_id IS NOT NULL AND out_type = 'PEMAKAIAN';
