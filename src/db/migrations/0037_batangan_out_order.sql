-- 0037 — Tautan order makloon di batangan_out (docs/26 §6)
-- Batangan keluar dari batch makloon (mis. order PT. B: TSG masuk → batangan
-- keluar) mewarisi order dari batch-nya untuk jejak serah terima.
ALTER TABLE batangan_out
  ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);

CREATE INDEX IF NOT EXISTS idx_batangan_out_order
  ON batangan_out (makloon_order_id);
