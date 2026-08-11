-- =============================================================================
-- RLS Policies — PostgreSQL Row-Level Security
-- =============================================================================
-- Semua tabel operasional wajib punya policy SELECT/INSERT/UPDATE/DELETE
-- yang di-filter oleh app.current_plant_ids dari session scope.
--
-- Setiap request, API layer set:
--   SET LOCAL app.current_plant_ids = '{uuid-a, uuid-b}';
--   SET LOCAL app.current_user_id = 'uuid-user';
--   SET LOCAL app.bypass_rls = 'false';
-- =============================================================================

-- =============================================================================
-- SHIFT_REPORT — core operasional
-- =============================================================================
ALTER TABLE shift_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_shift_select ON shift_report
  FOR SELECT
  USING (
    plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
    OR current_setting('app.bypass_rls', true) = 'true'
  );

CREATE POLICY p_shift_insert ON shift_report
  FOR INSERT
  WITH CHECK (
    plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
    OR current_setting('app.bypass_rls', true) = 'true'
  );

CREATE POLICY p_shift_update ON shift_report
  FOR UPDATE
  USING (
    (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
     OR current_setting('app.bypass_rls', true) = 'true')
    AND status != 'APPROVED'
  );

CREATE POLICY p_shift_delete ON shift_report
  FOR DELETE
  USING (
    (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
     OR current_setting('app.bypass_rls', true) = 'true')
    AND status = 'RUNNING'
  );

-- =============================================================================
-- SHIFT_MEMBER
-- =============================================================================
ALTER TABLE shift_member ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_sm_select ON shift_member FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_member.shift_report_id
    AND (sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true')
  ));

CREATE POLICY p_sm_insert ON shift_member FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_member.shift_report_id
    AND sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
  ));

CREATE POLICY p_sm_update ON shift_member FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_member.shift_report_id
    AND sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
    AND sr.status = 'RUNNING'
  ));

CREATE POLICY p_sm_delete ON shift_member FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_member.shift_report_id
    AND sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
    AND sr.status = 'RUNNING'
  ));

-- =============================================================================
-- Patron: semua tabel operasional dengan plant_id mengikuti pola shift_report
-- SHIFT_WASTE, TSG_BOX_PROCESS, TSG_BOX_CONSUMPTION, DOWNTIME_LOG,
-- MAINTENANCE_EVENT, BATCH, HLP_PACK, SHIFT_HANDOFF, MACHINE, SHIFT_TEMPLATE
-- =============================================================================

-- SHIFT_WASTE
ALTER TABLE shift_waste ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_sw_select ON shift_waste FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_waste.shift_report_id
    AND (sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true')
  ));
CREATE POLICY p_sw_insert ON shift_waste FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_waste.shift_report_id
    AND sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
  ));
CREATE POLICY p_sw_update ON shift_waste FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM shift_report sr WHERE sr.id = shift_waste.shift_report_id
    AND (sr.plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true')
    AND sr.status != 'APPROVED'
  ));

-- TSG_BOX_PROCESS
ALTER TABLE tsg_box_process ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_box_select ON tsg_box_process FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_box_insert ON tsg_box_process FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_box_update ON tsg_box_process FOR UPDATE
  USING ((plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
          OR current_setting('app.bypass_rls', true) = 'true')
         AND completed_at IS NULL);
CREATE POLICY p_box_delete ON tsg_box_process FOR DELETE
  USING ((plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
          OR current_setting('app.bypass_rls', true) = 'true')
         AND completed_at IS NULL);

-- TSG_BOX_CONSUMPTION
ALTER TABLE tsg_box_consumption ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_cons_select ON tsg_box_consumption FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_cons_insert ON tsg_box_consumption FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

-- DOWNTIME_LOG
ALTER TABLE downtime_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_dl_select ON downtime_log FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_dl_insert ON downtime_log FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

-- MAINTENANCE_EVENT
ALTER TABLE maintenance_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_mtn_select ON maintenance_event FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mtn_insert ON maintenance_event FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

-- BATCH
ALTER TABLE batch ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_batch_select ON batch FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_batch_insert ON batch FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

-- HLP_PACK
ALTER TABLE hlp_pack ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_hlp_select ON hlp_pack FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_hlp_insert ON hlp_pack FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

-- SHIFT_HANDOFF
ALTER TABLE shift_handoff ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_ho_select ON shift_handoff FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_ho_insert ON shift_handoff FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_ho_update ON shift_handoff FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

-- MACHINE (master data)
ALTER TABLE machine ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_mch_select ON machine FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mch_insert ON machine FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_mch_update ON machine FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

-- SHIFT_TEMPLATE
ALTER TABLE shift_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_st_select ON shift_template FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_st_insert ON shift_template FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_st_update ON shift_template FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

-- =============================================================================
-- WMS INBOUND — tsg_receiving, tsg_receiving_box, tsg_inventory
-- =============================================================================
ALTER TABLE tsg_receiving ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_tr_select ON tsg_receiving FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tr_insert ON tsg_receiving FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_tr_update ON tsg_receiving FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE tsg_receiving_box ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_trb_select ON tsg_receiving_box FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_trb_insert ON tsg_receiving_box FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE tsg_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_inv_select ON tsg_inventory FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_inv_insert ON tsg_inventory FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_inv_update ON tsg_inventory FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

-- =============================================================================
-- WMS OUTBOUND — finished_goods_receiving, carton, carton_content
-- =============================================================================
ALTER TABLE finished_goods_receiving ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_fgr_select ON finished_goods_receiving FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_fgr_insert ON finished_goods_receiving FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_fgr_update ON finished_goods_receiving FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE carton ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_carton_select ON carton FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_carton_insert ON carton FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_carton_update ON carton FOR UPDATE
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE carton_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_cc_select ON carton_content FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_cc_insert ON carton_content FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

-- =============================================================================
-- DISTRIBUSI — dispatch_order, dispatch_item, dispatch_document
-- =============================================================================
ALTER TABLE dispatch_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_do_select ON dispatch_order FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_do_insert ON dispatch_order FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_do_update ON dispatch_order FOR UPDATE
  USING ((plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
          OR current_setting('app.bypass_rls', true) = 'true')
         AND status != 'DISPATCHED');

ALTER TABLE dispatch_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_di_select ON dispatch_item FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_di_insert ON dispatch_item FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');

ALTER TABLE dispatch_document ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_dd_select ON dispatch_document FOR SELECT
  USING (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
         OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY p_dd_insert ON dispatch_document FOR INSERT
  WITH CHECK (plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
              OR current_setting('app.bypass_rls', true) = 'true');
