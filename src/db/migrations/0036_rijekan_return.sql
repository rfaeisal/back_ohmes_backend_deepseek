-- =============================================================================
-- 0036 — Serah terima waste makloon (docs/26 §5)
-- =============================================================================
-- Waste/rijek origin MAKLOON dikembalikan ke customer per order: header
-- rijekan_return + item per lot ledger (porsi yang diserahkan). Lot yang
-- diserahkan ditandai returned_at/returned_ref di rijekan_ledger.
-- Idempotent (di-run tiap deploy).
-- =============================================================================

CREATE TABLE IF NOT EXISTS rijekan_return (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          uuid NOT NULL REFERENCES plant(id), -- RLS
  makloon_order_id  uuid REFERENCES makloon_order(id),
  customer          text NOT NULL,                      -- pemesan (denormalized)
  doc_ref           text,                               -- referensi dokumen
  notes             text,
  returned_by       uuid NOT NULL REFERENCES "user"(id),
  returned_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rijekan_return_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id        uuid NOT NULL REFERENCES rijekan_return(id) ON DELETE CASCADE,
  plant_id         uuid NOT NULL REFERENCES plant(id), -- RLS
  ledger_entry_id  uuid NOT NULL REFERENCES rijekan_ledger(id),
  qty              numeric NOT NULL,                   -- porsi lot diserahkan
  unit             text NOT NULL                       -- KG | BATANG | PACK | SLOP | BAL
);

CREATE INDEX IF NOT EXISTS idx_rijekan_return_plant ON rijekan_return (plant_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_rijekan_return_order ON rijekan_return (makloon_order_id);
CREATE INDEX IF NOT EXISTS idx_rijekan_return_item_return ON rijekan_return_item (return_id);
CREATE INDEX IF NOT EXISTS idx_rijekan_return_item_ledger ON rijekan_return_item (ledger_entry_id);

ALTER TABLE rijekan_return_item DROP CONSTRAINT IF EXISTS ck_rijekan_return_item_unit;
ALTER TABLE rijekan_return_item ADD CONSTRAINT ck_rijekan_return_item_unit
  CHECK (unit IN ('KG', 'BATANG', 'PACK', 'SLOP', 'BAL'));

-- ---------------------------------------------------------------------------
-- RLS (pola 0025)
-- ---------------------------------------------------------------------------

ALTER TABLE rijekan_return ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_rijekan_return_select ON rijekan_return;
CREATE POLICY p_rijekan_return_select ON rijekan_return FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_return_insert ON rijekan_return;
CREATE POLICY p_rijekan_return_insert ON rijekan_return FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_return_update ON rijekan_return;
CREATE POLICY p_rijekan_return_update ON rijekan_return FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE rijekan_return_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_rijekan_return_item_select ON rijekan_return_item;
CREATE POLICY p_rijekan_return_item_select ON rijekan_return_item FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_return_item_insert ON rijekan_return_item;
CREATE POLICY p_rijekan_return_item_insert ON rijekan_return_item FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
DROP POLICY IF EXISTS p_rijekan_return_item_update ON rijekan_return_item;
CREATE POLICY p_rijekan_return_item_update ON rijekan_return_item FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
