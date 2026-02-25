-- Migration 052: school-analysis launch gate view

CREATE OR REPLACE VIEW public.vw_school_analysis_launch_gate AS
SELECT
  NOW() AS calculated_at,
  COUNT(*)::INT AS preview_district_count,
  ROUND(AVG(COALESCE(official_coverage_pct, 0))::NUMERIC, 2) AS avg_official_coverage_pct,
  ROUND(AVG(COALESCE(inferred_ratio_pct, 100))::NUMERIC, 2) AS avg_inferred_ratio_pct,
  ROUND(AVG(COALESCE(confidence_score, 0))::NUMERIC, 2) AS avg_confidence_score,
  MAX(data_freshness) AS latest_data_freshness,
  ROUND(AVG(CASE WHEN COALESCE(array_length(quality_flags, 1), 0) = 0 THEN 0 ELSE 1 END)::NUMERIC * 100, 2) AS flagged_district_pct,
  BOOL_AND(COALESCE(official_coverage_pct, 0) >= 95) AS all_districts_official_95,
  BOOL_AND(COALESCE(inferred_ratio_pct, 100) <= 20) AS all_districts_inferred_20
FROM public.vw_school_analysis_preview;
