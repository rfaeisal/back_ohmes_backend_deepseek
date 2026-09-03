-- =============================================================================
-- 0034 — Order makloon + pool waste terstruktur + produk final BATANGAN
-- =============================================================================
-- docs/26-waste-makloon-final.md: entitas order makloon (customer/produk/
-- satuan akhir/bahan masuk), ledger rijekan diperkaya tag jenis+asal+order
-- (pool waste), tabel alokasi reproses (rijekan_allocation), batangan keluar
-- (batangan_out), standar isi per produk, CHECK target_unit + BATANGAN,
-- karton hanya SLOP|BAL. Idempotent (di-run tiap deploy) — pola 0025/0029.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Order makloon (docs/26 §2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS makloon_order (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id      uuid NOT NULL REFERENCES plant(id), -- RLS
  code          text NOT NULL,                      -- 'MKL-20260903-001'
  customer      text NOT NULL,                      -- pemesan FREE TEXT
  product_name  text NOT NULL,                      -- 'Marbol - Putihan'
  tsg_type      text NOT NULL,                      -- REGULER | MILD | PUTIHAN
  final_form    text NOT NULL,                      -- BATANGAN|PACK|PACK_WRAP|SLOP|BAL|CARTON_SLOP|CARTON_BAL
  input_type    text NOT NULL,                      -- BATANGAN | TSG
  status        text NOT NULL DEFAULT 'OPEN',       -- OPEN|RECEIVING|PROCESSING|DONE
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_makloon_order_code
  ON makloon_order (plant_id, code);
CREATE INDEX IF NOT EXISTS idx_makloon_order_plant_status
  ON makloon_order (plant_id, status);

ALTER TABLE makloon_order DROP CONSTRAINT IF EXISTS ck_makloon_order_tsg_type;
ALTER TABLE makloon_order ADD CONSTRAINT ck_makloon_order_tsg_type
  CHECK (tsg_type IN ('REGULER', 'MILD', 'PUTIHAN'));

ALTER TABLE makloon_order DROP CONSTRAINT IF EXISTS ck_makloon_order_final_form;
ALTER TABLE makloon_order ADD CONSTRAINT ck_makloon_order_final_form
  CHECK (final_form IN ('BATANGAN', 'PACK', 'PACK_WRAP', 'SLOP', 'BAL', 'CARTON_SLOP', 'CARTON_BAL'));

ALTER TABLE makloon_order DROP CONSTRAINT IF EXISTS ck_makloon_order_input_type;
ALTER TABLE makloon_order ADD CONSTRAINT ck_makloon_order_input_type
  CHECK (input_type IN ('BATANGAN', 'TSG'));

ALTER TABLE makloon_order DROP CONSTRAINT IF EXISTS ck_makloon_order_status;
ALTER TABLE makloon_order ADD CONSTRAINT ck_makloon_order_status
  CHECK (status IN ('OPEN', 'RECEIVING', 'PROCESSING', 'DONE'));

-- ---------------------------------------------------------------------------
-- Tautan order ke receiving & batch (nullable FK — backward compatible)
-- ---------------------------------------------------------------------------

ALTER TABLE tsg_receiving
  ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);
ALTER TABLE external_batangan_receiving
  ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);
ALTER TABLE batch
  ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);
ALTER TABLE external_pack_out
  ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);

CREATE INDEX IF NOT EXISTS idx_tsg_recv_order ON tsg_receiving (makloon_order_id);
CREATE INDEX IF NOT EXISTS idx_ext_recv_order ON external_batangan_receiving (makloon_order_id);
CREATE INDEX IF NOT EXISTS idx_batch_order ON batch (makloon_order_id);
CREATE INDEX IF NOT EXISTS idx_ext_out_order ON external_pack_out (makloon_order_id);

-- ---------------------------------------------------------------------------
-- Ledger rijekan → pool terstruktur (docs/26 §3)
-- ---------------------------------------------------------------------------

ALTER TABLE rijekan_ledger ADD COLUMN IF NOT EXISTS tsg_type text;
ALTER TABLE rijekan_ledger ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE rijekan_ledger ADD COLUMN IF NOT EXISTS makloon_order_id uuid REFERENCES makloon_order(id);
ALTER TABLE rijekan_ledger ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE rijekan_ledger ADD COLUMN IF NOT EXISTS returned_ref text;

ALTER TABLE rijekan_ledger DROP CONSTRAINT IF EXISTS ck_rijekan_origin;
ALTER TABLE rijekan_ledger ADD CONSTRAINT ck_rijekan_origin
  CHECK (origin IN ('INTERNAL', 'MAKLOON'));

ALTER TABLE rijekan_ledger DROP CONSTRAINT IF EXISTS ck_rijekan_unit;
ALTER TABLE rijekan_ledger ADD CONSTRAINT ck_rijekan_unit
  CHECK (unit IN ('KG', 'BATANG', 'PACK', 'SLOP', 'BAL'));

CREATE INDEX IF NOT EXISTS idx_rijekan_pool
  ON rijekan_ledger (plant_id, origin, tsg_type, entry_type);
CREATE INDEX IF NOT EXISTS idx_rijekan_order
  ON rijekan_ledger (makloon_order_id);

-- ---------------------------------------------------------------------------
-- Alokasi reproses — porsi lot rijek yang dikonsumsi (docs/26 §4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rijekan_allocation (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id               uuid NOT NULL REFERENCES plant(id), -- RLS
  ledger_entry_id        uuid NOT NULL REFERENCES rijekan_ledger(id),
  reproses_receiving_id  uuid REFERENCES tsg_receiving(id),  -- hasil reproses
  qty                    numeric NOT NULL,                   -- porsi lot terpakai
  note                   text,
  allocated_by           uuid REFERENCES "user"(id),
  allocated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rijekan_alloc_ledger ON rijekan_allocation (ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_rijekan_alloc_plant ON rijekan_allocation (plant_id, allocated_at);

-- ---------------------------------------------------------------------------
-- Batangan keluar — produk final #1 (docs/26 §6)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS batangan_out (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          uuid NOT NULL REFERENCES plant(id), -- RLS
  batch_id          uuid REFERENCES batch(id),
  qty_kg            numeric NOT NULL,                   -- berat keluar (kg)
  batang_est        integer,                            -- perkiraan jumlah batang
  destination_type  text NOT NULL,                      -- INTERNAL | MAKLOON | LAIN
  destination_name  text NOT NULL,                      -- free text
  doc_ref           text,
  out_by            uuid NOT NULL REFERENCES "user"(id),
  out_at            timestamptz NOT NULL DEFAULT now(),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_batangan_out_plant ON batangan_out (plant_id, out_at);
CREATE INDEX IF NOT EXISTS idx_batangan_out_batch ON batangan_out (batch_id);

ALTER TABLE batangan_out DROP CONSTRAINT IF EXISTS ck_batangan_out_dest;
ALTER TABLE batangan_out ADD CONSTRAINT ck_batangan_out_dest
  CHECK (destination_type IN ('INTERNAL', 'MAKLOON', 'LAIN'));

-- ---------------------------------------------------------------------------
-- target_unit + BATANGAN (docs/26 §1) — CHECK lama diperluas
-- ---------------------------------------------------------------------------

ALTER TABLE batch DROP CONSTRAINT IF EXISTS ck_batch_target_unit;
ALTER TABLE batch ADD CONSTRAINT ck_batch_target_unit
  CHECK (target_unit IN ('BATANGAN', 'PACK', 'PACK_WRAP', 'SLOP', 'BAL'));

-- ---------------------------------------------------------------------------
-- Karton hanya SLOP|BAL (docs/26 §1, keputusan 3 Sep 2026) — PACK ditutup
-- ---------------------------------------------------------------------------
-- Data lama unit PACK dialihkan ke SLOP dengan catatan (idempotent: baris
-- yang sudah bukan PACK tidak tersentuh). Sebelum go-live tidak ada data
-- produksi nyata, jadi konversi ini murni penjaga.

UPDATE carton
   SET unit = 'SLOP',
       notes = COALESCE(notes || ' · ', '') || '[0034] unit PACK ditutup — dialihkan ke SLOP'
 WHERE unit = 'PACK';

ALTER TABLE carton DROP CONSTRAINT IF EXISTS ck_carton_unit;
ALTER TABLE carton ADD CONSTRAINT ck_carton_unit
  CHECK (unit IN ('SLOP', 'BAL'));

-- ---------------------------------------------------------------------------
-- Standar isi per produk (docs/26 §1)
-- ---------------------------------------------------------------------------

ALTER TABLE product ADD COLUMN IF NOT EXISTS slop_isi_pack integer NOT NULL DEFAULT 10;
ALTER TABLE product ADD COLUMN IF NOT EXISTS bal_isi_slop integer NOT NULL DEFAULT 20;
ALTER TABLE product ADD COLUMN IF NOT EXISTS karton_capacity_slop integer NOT NULL DEFAULT 50;
ALTER TABLE product ADD COLUMN IF NOT EXISTS karton_capacity_bal integer NOT NULL DEFAULT 4;

-- ---------------------------------------------------------------------------
-- RLS (pola 0025)
-- ---------------------------------------------------------------------------

ALTER TABLE makloon_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_mkl_order_select ON makloon_order;
CREATE POLICY p_mkl_order_select ON makloon_order FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_mkl_order_insert ON makloon_order;
CREATE POLICY p_mkl_order_insert ON makloon_order FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_mkl_order_update ON makloon_order;
CREATE POLICY p_mkl_order_update ON makloon_order FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE rijekan_allocation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_rijekan_alloc_select ON rijekan_allocation;
CREATE POLICY p_rijekan_alloc_select ON rijekan_allocation FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_alloc_insert ON rijekan_allocation;
CREATE POLICY p_rijekan_alloc_insert ON rijekan_allocation FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_alloc_update ON rijekan_allocation;
CREATE POLICY p_rijekan_alloc_update ON rijekan_allocation FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE batangan_out ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_batangan_out_select ON batangan_out;
CREATE POLICY p_batangan_out_select ON batangan_out FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_batangan_out_insert ON batangan_out;
CREATE POLICY p_batangan_out_insert ON batangan_out FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_batangan_out_update ON batangan_out;
CREATE POLICY p_batangan_out_update ON batangan_out FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
