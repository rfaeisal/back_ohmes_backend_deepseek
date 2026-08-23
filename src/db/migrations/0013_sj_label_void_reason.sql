-- =============================================================================
-- 0013 — Void reason di label SJ (compliance audit)
-- =============================================================================
-- Handoff mobile v2.2.3 §5: alasan void sekarang cuma disimpan lokal di
-- analytics event. Kolom `void_reason` di supplier_sj_box menyimpan alasan
-- ke DB supaya audit bisa telusuri kenapa label di-VOID.
-- Sekalian catat voided_at + voided_by untuk lengkap.
-- =============================================================================

ALTER TABLE supplier_sj_box
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES "user"(id);

CREATE INDEX IF NOT EXISTS idx_sj_box_voided_at ON supplier_sj_box (voided_at)
  WHERE voided_at IS NOT NULL;
