-- =============================================================================
-- Materialized View: mv_area_daily_kpi
-- =============================================================================
-- Rollup KPI harian per area. Di-refresh saat shift.status → APPROVED.
-- Digunakan oleh dashboard koordinator area & HQ.
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_area_daily_kpi AS
SELECT
  r.id AS region_id,
  r.code AS region_code,
  p.id AS plant_id,
  p.code AS plant_code,
  sr.report_date,
  COUNT(DISTINCT sr.id) AS total_shifts,
  COUNT(DISTINCT CASE WHEN sr.status = 'APPROVED' THEN sr.id END) AS approved_shifts,
  COUNT(DISTINCT CASE WHEN sr.status = 'COMPLETED' THEN sr.id END) AS completed_shifts,
  COUNT(DISTINCT CASE WHEN sr.status = 'RUNNING' THEN sr.id END) AS running_shifts,
  COALESCE(SUM(sw.kg::decimal) FILTER (WHERE sw.category = 'MENIR'), 0) AS waste_menir_kg,
  COALESCE(SUM(sw.kg::decimal) FILTER (WHERE sw.category = 'RIJEKAN'), 0) AS waste_rijekan_kg,
  COALESCE(SUM(sw.kg::decimal) FILTER (WHERE sw.category = 'DEBU_KASAR'), 0) AS waste_debu_kasar_kg,
  COALESCE(SUM(sw.kg::decimal) FILTER (WHERE sw.category = 'DEBU_HALUS'), 0) AS waste_debu_halus_kg
FROM shift_report sr
JOIN plant p ON sr.plant_id = p.id
JOIN region r ON p.region_id = r.id
LEFT JOIN shift_waste sw ON sr.id = sw.shift_report_id
WHERE sr.deleted_at IS NULL
GROUP BY r.id, r.code, p.id, p.code, sr.report_date;

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS idx_mv_area_kpi_region_date
  ON mv_area_daily_kpi (region_id, report_date);

CREATE INDEX IF NOT EXISTS idx_mv_area_kpi_plant_date
  ON mv_area_daily_kpi (plant_id, report_date);

-- =============================================================================
-- Refresh function — dipanggil setelah shift APPROVED
-- =============================================================================

CREATE OR REPLACE FUNCTION refresh_mv_area_daily_kpi()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_area_daily_kpi;
END;
$$ LANGUAGE plpgsql;
