-- =============================================================================
-- Material Out — keluar consumable/sparepart (kirim pabrik lain / retur supplier)
-- =============================================================================
CREATE TYPE material_out_type AS ENUM ('TRANSFER', 'RETUR');

CREATE TABLE material_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id),
  material_type material_type NOT NULL,
  out_type material_out_type NOT NULL,
  counterpart_name text NOT NULL,
  out_code text NOT NULL,
  reason text NOT NULL,
  notes text,
  out_at timestamp NOT NULL DEFAULT now(),
  out_by uuid NOT NULL REFERENCES "user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (plant_id, out_code)
);
CREATE INDEX idx_material_out_plant ON material_out (plant_id, out_at);

CREATE TABLE consumable_out_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  out_id uuid NOT NULL REFERENCES material_out(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  consumable_item_id uuid NOT NULL REFERENCES consumable_item(id),
  quantity numeric(10,2) NOT NULL,
  seq integer NOT NULL,
  UNIQUE (out_id, seq)
);

CREATE TABLE sparepart_out_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  out_id uuid NOT NULL REFERENCES material_out(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  sparepart_id uuid NOT NULL REFERENCES sparepart(id),
  quantity integer NOT NULL,
  seq integer NOT NULL,
  UNIQUE (out_id, seq)
);

-- RLS
ALTER TABLE material_out ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_mo_select ON material_out FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mo_insert ON material_out FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mo_update ON material_out FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mo_delete ON material_out FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE consumable_out_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_coi_select ON consumable_out_item FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_coi_insert ON consumable_out_item FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_coi_update ON consumable_out_item FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_coi_delete ON consumable_out_item FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE sparepart_out_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_soi_select ON sparepart_out_item FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_soi_insert ON sparepart_out_item FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_soi_update ON sparepart_out_item FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_soi_delete ON sparepart_out_item FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
