-- =============================================================================
-- 0014 — Link balik tsg_receiving → supplier_sj (mobile handoff v2.2.3 §4)
-- =============================================================================
-- Kontrak GET /tsg-receiving/:id mengharapkan `sjId` supaya detail screen
-- bisa link ke Surat Jalan asal. Kolom NULL untuk receiving manual (tanpa SJ).
-- Diisi oleh receiveFromSupplierSj() saat pabrik verifikasi SJ.
-- =============================================================================

ALTER TABLE tsg_receiving
  ADD COLUMN IF NOT EXISTS supplier_sj_id UUID REFERENCES supplier_sj(id);

CREATE INDEX IF NOT EXISTS idx_tsg_recv_sj ON tsg_receiving (supplier_sj_id)
  WHERE supplier_sj_id IS NOT NULL;
