-- 0031 — Penanda TSG makloon: tercatat dari penerimaan sampai produk akhir.
-- is_makloon + pemesan makloon + produk jadi pesanan di receiving →
-- inventory (saat approve) → batch (saat timbang sesi MAKER) → otomatis
-- terwariskan ke hlp_pack/carton/dispatch via batch.
-- Idempotent (di-run tiap deploy).

ALTER TABLE tsg_receiving ADD COLUMN IF NOT EXISTS is_makloon boolean NOT NULL DEFAULT false;
ALTER TABLE tsg_receiving ADD COLUMN IF NOT EXISTS makloon_customer text;
ALTER TABLE tsg_receiving ADD COLUMN IF NOT EXISTS makloon_target text;
ALTER TABLE tsg_receiving DROP CONSTRAINT IF EXISTS ck_receiving_makloon_target;
ALTER TABLE tsg_receiving ADD CONSTRAINT ck_receiving_makloon_target
  CHECK (makloon_target IS NULL OR makloon_target IN ('PACK', 'PACK_WRAP', 'SLOP', 'BAL', 'KARTON'));

ALTER TABLE tsg_inventory ADD COLUMN IF NOT EXISTS is_makloon boolean NOT NULL DEFAULT false;
ALTER TABLE tsg_inventory ADD COLUMN IF NOT EXISTS makloon_customer text;
ALTER TABLE tsg_inventory ADD COLUMN IF NOT EXISTS makloon_target text;

ALTER TABLE batch ADD COLUMN IF NOT EXISTS is_makloon_tsg boolean NOT NULL DEFAULT false;
ALTER TABLE batch ADD COLUMN IF NOT EXISTS makloon_customer text;
ALTER TABLE batch ADD COLUMN IF NOT EXISTS makloon_target text;
