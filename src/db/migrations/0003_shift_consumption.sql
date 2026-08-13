-- =============================================================================
-- Shift Consumption — pemakaian consumable di level shift (bukan per boks)
-- Dipakai saat Akhiri Shift untuk catat material tambahan (karton, dus, dll)
-- =============================================================================
CREATE TABLE shift_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_report_id uuid NOT NULL REFERENCES shift_report(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES plant(id),
  consumable_item_id uuid NOT NULL REFERENCES consumable_item(id),
  quantity numeric(10,2) NOT NULL,
  note text,
  logged_at timestamp NOT NULL DEFAULT now(),
  logged_by uuid NOT NULL REFERENCES "user"(id)
);
CREATE INDEX idx_shift_cons_shift ON shift_consumption (shift_report_id);

ALTER TABLE shift_consumption ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_sc_select ON shift_consumption FOR SELECT USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sc_insert ON shift_consumption FOR INSERT WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sc_update ON shift_consumption FOR UPDATE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_sc_delete ON shift_consumption FOR DELETE USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[]) OR current_setting('app.bypass_rls', true) = 'true');

-- Penanda material yang boleh dicatat saat Akhiri Shift
ALTER TABLE consumable_item ADD COLUMN allow_at_end_shift boolean NOT NULL DEFAULT false;

-- Harga beli per unit di receiving material/sparepart (untuk rekap biaya)
ALTER TABLE consumable_receiving_item ADD COLUMN unit_price numeric(14,2);
ALTER TABLE sparepart_receiving_item ADD COLUMN unit_price numeric(14,2);
