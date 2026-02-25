-- Migration 053: school-analysis launch gate RPC

CREATE OR REPLACE FUNCTION public.get_school_analysis_launch_gate(
  p_min_district_count INT DEFAULT 220,
  p_min_official_coverage NUMERIC DEFAULT 95,
  p_max_inferred_ratio NUMERIC DEFAULT 20,
  p_max_freshness_days INT DEFAULT 45
)
RETURNS TABLE(
  calculated_at TIMESTAMPTZ,
  preview_district_count INT,
  avg_official_coverage_pct NUMERIC,
  avg_inferred_ratio_pct NUMERIC,
  avg_confidence_score NUMERIC,
  latest_data_freshness TIMESTAMPTZ,
  freshness_days NUMERIC,
  gate_pass BOOLEAN,
  failed_checks TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      lg.calculated_at,
      lg.preview_district_count,
      lg.avg_official_coverage_pct,
      lg.avg_inferred_ratio_pct,
      lg.avg_confidence_score,
      lg.latest_data_freshness,
      CASE
        WHEN lg.latest_data_freshness IS NULL THEN NULL
        ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - lg.latest_data_freshness)) / 86400.0, 2)
      END AS freshness_days
    FROM public.vw_school_analysis_launch_gate lg
  ),
  checks AS (
    SELECT
      b.*,
      ARRAY_REMOVE(
        ARRAY[
          CASE WHEN b.preview_district_count < p_min_district_count THEN 'preview_district_count' END,
          CASE WHEN COALESCE(b.avg_official_coverage_pct, 0) < p_min_official_coverage THEN 'official_coverage' END,
          CASE WHEN COALESCE(b.avg_inferred_ratio_pct, 100) > p_max_inferred_ratio THEN 'inferred_ratio' END,
          CASE WHEN b.freshness_days IS NULL OR b.freshness_days > p_max_freshness_days THEN 'freshness' END
        ],
        NULL
      )::TEXT[] AS failed_checks
    FROM base b
  )
  SELECT
    c.calculated_at,
    c.preview_district_count,
    c.avg_official_coverage_pct,
    c.avg_inferred_ratio_pct,
    c.avg_confidence_score,
    c.latest_data_freshness,
    c.freshness_days,
    COALESCE(array_length(c.failed_checks, 1), 0) = 0 AS gate_pass,
    c.failed_checks
  FROM checks c;
$$;

REVOKE ALL ON FUNCTION public.get_school_analysis_launch_gate(INT, NUMERIC, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_analysis_launch_gate(INT, NUMERIC, NUMERIC, INT)
  TO anon, authenticated, service_role;
