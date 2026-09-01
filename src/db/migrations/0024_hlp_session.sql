-- =============================================================================
-- 0024 — Sesi HLP open-ended + reject pack + ledger rijekan (docs/23 tahap 1)
-- =============================================================================
-- Sesi HLP = entitas kehadiran kontinu (bukan shift 8 jam): ganti anggota
-- tanpa tutup, tanpa approval. Reject pack = pack utuh ditolak, dihitung
-- sebagai batangan. Ledger rijekan = pembukuan rijekan MAKER (kg) + reject
-- HLP (batang) → reproses jadi TSG (docs/23 §5).
-- Enum WASTE sudah ditambahkan di 0023 (file terpisah).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sesi HLP
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hlp_shift (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id        uuid NOT NULL REFERENCES plant(id),
  hlp_machine_id  uuid NOT NULL REFERENCES machine(id),
  started_by      uuid NOT NULL REFERENCES "user"(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_by        uuid REFERENCES "user"(id),
  ended_at        timestamptz,
  status          text NOT NULL DEFAULT 'OPEN', -- OPEN | CLOSED
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE IF NOT EXISTS hlp_shift_member (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hlp_shift_id  uuid NOT NULL REFERENCES hlp_shift(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES "user"(id),
  shift_role_id uuid REFERENCES shift_role(id), -- roster default, bebas pilih
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hlp_shift_open_per_machine
  ON hlp_shift (hlp_machine_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_hlp_shift_plant_status ON hlp_shift (plant_id, status);
CREATE INDEX IF NOT EXISTS idx_hlp_shift_member_shift ON hlp_shift_member (hlp_shift_id);
CREATE INDEX IF NOT EXISTS idx_hlp_shift_member_user ON hlp_shift_member (user_id);

-- ---------------------------------------------------------------------------
-- Reject pack + sesi di hlp_pack
-- ---------------------------------------------------------------------------

ALTER TABLE hlp_pack
  ADD COLUMN IF NOT EXISTS hlp_shift_id uuid REFERENCES hlp_shift(id);

ALTER TABLE hlp_pack
  ADD COLUMN IF NOT EXISTS reject_packs integer NOT NULL DEFAULT 0;

ALTER TABLE hlp_pack
  ADD COLUMN IF NOT EXISTS reject_reason text;

-- ---------------------------------------------------------------------------
-- Ledger rijekan (docs/23 §5.2 — tingkat 2: angka terlihat, peristiwa manual)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rijekan_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id    uuid NOT NULL REFERENCES plant(id), -- RLS
  entry_type  text NOT NULL, -- IN_MAKER_WASTE | IN_HLP_REJECT | OUT_REPROSES
  quantity    numeric NOT NULL,
  unit        text NOT NULL, -- KG | BATANG
  ref_id      uuid,          -- id waste / hlp_pack / tsg_receiving
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rijekan_ledger_plant ON rijekan_ledger (plant_id, entry_type);
CREATE INDEX IF NOT EXISTS idx_rijekan_ledger_ref ON rijekan_ledger (ref_id);

-- ---------------------------------------------------------------------------
-- RLS (pola 0000_rls_policies.sql + 0008 app role)
-- ---------------------------------------------------------------------------

ALTER TABLE hlp_shift ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_hshift_select ON hlp_shift;
CREATE POLICY p_hshift_select ON hlp_shift FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_hshift_insert ON hlp_shift;
CREATE POLICY p_hshift_insert ON hlp_shift FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_hshift_update ON hlp_shift;
CREATE POLICY p_hshift_update ON hlp_shift FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE hlp_shift_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_hsm_select ON hlp_shift_member;
CREATE POLICY p_hsm_select ON hlp_shift_member FOR SELECT
  USING (EXISTS (SELECT 1 FROM hlp_shift hs
                 WHERE hs.id = hlp_shift_id
                   AND hs.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]))
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_hsm_insert ON hlp_shift_member;
CREATE POLICY p_hsm_insert ON hlp_shift_member FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM hlp_shift hs
                      WHERE hs.id = hlp_shift_id
                        AND hs.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]))
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_hsm_update ON hlp_shift_member;
CREATE POLICY p_hsm_update ON hlp_shift_member FOR UPDATE
  USING (EXISTS (SELECT 1 FROM hlp_shift hs
                 WHERE hs.id = hlp_shift_id
                   AND hs.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]))
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE rijekan_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_rijekan_select ON rijekan_ledger;
CREATE POLICY p_rijekan_select ON rijekan_ledger FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_insert ON rijekan_ledger;
CREATE POLICY p_rijekan_insert ON rijekan_ledger FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
