-- =============================================================================
-- TSG Return Out — retur TSG ke supplier (boks cacat, salah kirim, dll)
-- =============================================================================
ALTER TYPE tsg_inventory_status ADD VALUE IF NOT EXISTS 'RETURNED';

CREATE TABLE tsg_return_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id),
  supplier_id uuid NOT NULL REFERENCES tsg_supplier(id),
  return_code text NOT NULL,
  total_box_count integer NOT NULL,
  total_weight_kg numeric(12,2) NOT NULL,
  reason text NOT NULL,
  notes text,
  returned_at timestamp NOT NULL DEFAULT now(),
  returned_by uuid NOT NULL REFERENCES "user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (plant_id, return_code)
);
CREATE INDEX idx_tsg_return_plant ON tsg_return_out (plant_id, returned_at);

CREATE TABLE tsg_return_out_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES tsg_return_out(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  inventory_id uuid NOT NULL REFERENCES tsg_inventory(id),
  box_code text NOT NULL,
  weight_kg numeric(10,2) NOT NULL,
  seq integer NOT NULL,
  UNIQUE (return_id, seq)
);

-- RLS
ALTER TABLE tsg_return_out ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_tro_select ON tsg_return_out FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tro_insert ON tsg_return_out FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tro_update ON tsg_return_out FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tro_delete ON tsg_return_out FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE tsg_return_out_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_troi_select ON tsg_return_out_item FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_troi_insert ON tsg_return_out_item FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_troi_update ON tsg_return_out_item FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_troi_delete ON tsg_return_out_item FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
