-- =============================================================================
-- Material Receiving — Consumable & Sparepart (tiru pola TSG receiving)
-- =============================================================================
CREATE TYPE material_type AS ENUM ('CONSUMABLE', 'SPAREPART');

CREATE TABLE material_receiving (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id),
  supplier_id uuid NOT NULL REFERENCES tsg_supplier(id),
  receiving_code text NOT NULL,
  received_at timestamp NOT NULL,
  received_by uuid NOT NULL REFERENCES "user"(id),
  material_type material_type NOT NULL,
  supplier_doc_ref text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp,
  UNIQUE (plant_id, receiving_code)
);
CREATE INDEX idx_material_recv_plant_date ON material_receiving (plant_id, received_at);

CREATE TABLE consumable_receiving_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id uuid NOT NULL REFERENCES material_receiving(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  consumable_item_id uuid NOT NULL REFERENCES consumable_item(id),
  quantity numeric(10,2) NOT NULL,
  seq integer NOT NULL,
  UNIQUE (receiving_id, seq)
);

CREATE TABLE sparepart_receiving_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id uuid NOT NULL REFERENCES material_receiving(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  sparepart_id uuid NOT NULL REFERENCES sparepart(id),
  quantity integer NOT NULL,
  seq integer NOT NULL,
  UNIQUE (receiving_id, seq)
);

-- =============================================================================
-- RLS Policies
-- =============================================================================
ALTER TABLE material_receiving ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_mat_recv_select ON material_receiving FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mat_recv_insert ON material_receiving FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mat_recv_update ON material_receiving FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mat_recv_delete ON material_receiving FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE consumable_receiving_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_cons_item_select ON consumable_receiving_item FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_cons_item_insert ON consumable_receiving_item FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_cons_item_update ON consumable_receiving_item FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_cons_item_delete ON consumable_receiving_item FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE sparepart_receiving_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_sp_item_select ON sparepart_receiving_item FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sp_item_insert ON sparepart_receiving_item FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sp_item_update ON sparepart_receiving_item FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sp_item_delete ON sparepart_receiving_item FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
