-- =============================================================================
-- 0018 — Maintenance & downtime level mesin (backlog #2, 26 Agu 2026)
-- =============================================================================
-- Catatan perbaikan/preventive DAN downtime per mesin TANPA terikat shift
-- (downtime_log yang lama terikat shift_report — hanya cocok untuk MAKER
-- dalam sesi shift; HLP dan mesin lain butuh catatan level mesin).
-- Pola RLS mengikuti 0000_rls_policies.sql (per policy + bypass).
-- =============================================================================

CREATE TABLE IF NOT EXISTS machine_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plant(id),
  machine_id UUID NOT NULL REFERENCES machine(id),
  maintenance_type TEXT NOT NULL DEFAULT 'PERBAIKAN', -- PERBAIKAN | PREVENTIVE
  description TEXT NOT NULL,
  maintenance_at TIMESTAMP NOT NULL DEFAULT now(),
  done_by UUID REFERENCES "user"(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_machine ON machine_maintenance (machine_id, maintenance_at DESC);

CREATE TABLE IF NOT EXISTS machine_downtime (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plant(id),
  machine_id UUID NOT NULL REFERENCES machine(id),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NOT NULL,
  reason TEXT NOT NULL,
  logged_by UUID REFERENCES "user"(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_machine ON machine_downtime (machine_id, started_at DESC);

ALTER TABLE machine_maintenance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_mm_select ON machine_maintenance;
CREATE POLICY p_mm_select ON machine_maintenance FOR SELECT USING (
  plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);
DROP POLICY IF EXISTS p_mm_insert ON machine_maintenance;
CREATE POLICY p_mm_insert ON machine_maintenance FOR INSERT WITH CHECK (
  plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);

ALTER TABLE machine_downtime ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_md_select ON machine_downtime;
CREATE POLICY p_md_select ON machine_downtime FOR SELECT USING (
  plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);
DROP POLICY IF EXISTS p_md_insert ON machine_downtime;
CREATE POLICY p_md_insert ON machine_downtime FOR INSERT WITH CHECK (
  plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);

GRANT SELECT, INSERT ON machine_maintenance TO mes_app;
GRANT SELECT, INSERT ON machine_downtime TO mes_app;
