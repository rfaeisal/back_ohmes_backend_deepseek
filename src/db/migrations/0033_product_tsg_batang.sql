-- 0033 — Master produk: jenis TSG & batang per pack (3 Sep 2026)
-- Satu jenis TSG per produk; batang per pack jadi default isi pack di HLP.
ALTER TABLE product ADD COLUMN IF NOT EXISTS tsg_type text;
ALTER TABLE product ADD COLUMN IF NOT EXISTS batang_per_pack integer;
ALTER TABLE product DROP CONSTRAINT IF EXISTS ck_product_tsg_type;
ALTER TABLE product ADD CONSTRAINT ck_product_tsg_type CHECK (tsg_type IS NULL OR tsg_type IN ('REGULER', 'MILD', 'PUTIHAN'));
