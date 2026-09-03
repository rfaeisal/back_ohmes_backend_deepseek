-- 0035 — Denormalisasi makloon_order_id ke inventory (docs/26 §2.2)
-- Pola sama dengan tsg_type/is_makloon (0031): order diteruskan ke inventory
-- saat approve, lalu ke batch saat timbang sesi — jejak order sampai produk akhir.
ALTER TABLE tsg_inventory
  ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);

CREATE INDEX IF NOT EXISTS idx_inv_makloon_order
  ON tsg_inventory (makloon_order_id);
