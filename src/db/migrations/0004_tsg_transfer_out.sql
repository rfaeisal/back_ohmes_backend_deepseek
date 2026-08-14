-- =============================================================================
-- TSG Transfer Out — kirim TSG ke pabrik lain (eksternal, di luar sistem)
-- =============================================================================
ALTER TYPE tsg_inventory_status ADD VALUE IF NOT EXISTS 'TRANSFERRED';

CREATE TABLE tsg_transfer_out (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES plant(id),
  destination_name text NOT NULL,
  transfer_code text NOT NULL,
  total_box_count integer NOT NULL,
  total_weight_kg numeric(12,2) NOT NULL,
  notes text,
  sent_at timestamp NOT NULL DEFAULT now(),
  sent_by uuid NOT NULL REFERENCES "user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (plant_id, transfer_code)
);
CREATE INDEX idx_tsg_transfer_plant ON tsg_transfer_out (plant_id, sent_at);

CREATE TABLE tsg_transfer_out_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES tsg_transfer_out(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  inventory_id uuid NOT NULL REFERENCES tsg_inventory(id),
  box_code text NOT NULL,
  weight_kg numeric(10,2) NOT NULL,
  seq integer NOT NULL,
  UNIQUE (transfer_id, seq)
);

-- RLS
ALTER TABLE tsg_transfer_out ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_tto_select ON tsg_transfer_out FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tto_insert ON tsg_transfer_out FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tto_update ON tsg_transfer_out FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tto_delete ON tsg_transfer_out FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE tsg_transfer_out_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_ttoi_select ON tsg_transfer_out_item FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_ttoi_insert ON tsg_transfer_out_item FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_ttoi_update ON tsg_transfer_out_item FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_ttoi_delete ON tsg_transfer_out_item FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
