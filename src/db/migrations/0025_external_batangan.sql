-- =============================================================================
-- 0025 — Makloon: penerimaan batangan external + keluaran pack ke customer
-- =============================================================================
-- docs/24: pabrik terima order packing dari luar — batangan milik pihak lain
-- diproses HLP kita, pack + rijekan dikembalikan ke customer. Batch jadi unit
-- pelacak rantai: kolom source INTERNAL|EXTERNAL; batch external punya
-- shift_report_id & machine_id NULL (bukan produksi MAKER kita).
-- =============================================================================

-- Batch: source + link penerimaan; kolom MAKER jadi nullable untuk external
ALTER TABLE batch
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'INTERNAL';

ALTER TABLE batch
  ADD COLUMN IF NOT EXISTS external_receiving_id uuid;

ALTER TABLE batch
  ALTER COLUMN shift_report_id DROP NOT NULL;

ALTER TABLE batch
  ALTER COLUMN machine_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Penerimaan batangan external (gudang inbound, PENDING → approve/reject)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS external_batangan_receiving (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          uuid NOT NULL REFERENCES plant(id), -- RLS
  sender_name       text NOT NULL,                      -- pengirim FREE TEXT
  doc_ref           text,                               -- nomor PO/DO
  batangan_kg       numeric NOT NULL,                   -- berat diterima (kg)
  received_at       timestamptz NOT NULL DEFAULT now(),
  received_by       uuid NOT NULL REFERENCES "user"(id),
  approval_status   text NOT NULL DEFAULT 'PENDING',    -- PENDING | APPROVED | REJECTED
  approved_by       uuid REFERENCES "user"(id),
  approved_at       timestamptz,
  rejection_reason  text,
  rejected_by       uuid REFERENCES "user"(id),
  rejected_at       timestamptz,
  batch_id          uuid REFERENCES batch(id),          -- diisi saat approve
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ext_recv_plant_status
  ON external_batangan_receiving (plant_id, approval_status);

-- ---------------------------------------------------------------------------
-- Keluaran ke customer (per batch langsung, tanpa detail karton — docs/24 §2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS external_pack_out (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id           uuid NOT NULL REFERENCES plant(id), -- RLS
  batch_id           uuid NOT NULL REFERENCES batch(id),
  destination_name   text NOT NULL,                      -- customer FREE TEXT
  doc_ref            text,
  pack_qty           integer NOT NULL,                   -- pack lolos dikembalikan
  reject_pack_qty    integer NOT NULL DEFAULT 0,         -- pack reject utuh dikembalikan
  reject_batang_qty  integer NOT NULL DEFAULT 0,         -- batangan reject dikembalikan
  out_at             timestamptz NOT NULL DEFAULT now(),
  out_by             uuid NOT NULL REFERENCES "user"(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ext_pack_out_plant ON external_pack_out (plant_id, out_at);
CREATE INDEX IF NOT EXISTS idx_ext_pack_out_batch ON external_pack_out (batch_id);

-- ---------------------------------------------------------------------------
-- RLS (pola 0000 + 0008)
-- ---------------------------------------------------------------------------

ALTER TABLE external_batangan_receiving ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ext_recv_select ON external_batangan_receiving;
CREATE POLICY p_ext_recv_select ON external_batangan_receiving FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_ext_recv_insert ON external_batangan_receiving;
CREATE POLICY p_ext_recv_insert ON external_batangan_receiving FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_ext_recv_update ON external_batangan_receiving;
CREATE POLICY p_ext_recv_update ON external_batangan_receiving FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE external_pack_out ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_ext_out_select ON external_pack_out;
CREATE POLICY p_ext_out_select ON external_pack_out FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_ext_out_insert ON external_pack_out;
CREATE POLICY p_ext_out_insert ON external_pack_out FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_ext_out_update ON external_pack_out;
CREATE POLICY p_ext_out_update ON external_pack_out FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
