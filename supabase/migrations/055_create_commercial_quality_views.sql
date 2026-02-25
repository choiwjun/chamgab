-- Migration 055: commercial quality helper views

CREATE OR REPLACE VIEW public.vw_commercial_coverage_freshness AS
WITH sigungu_counts AS (
  SELECT
    (SELECT COUNT(DISTINCT sigungu_code)
     FROM public.business_statistics
     WHERE sigungu_code IS NOT NULL AND sigungu_code <> '') AS sigungu_coverage_business,
    (SELECT COUNT(DISTINCT sigungu_code)
     FROM public.sales_statistics
     WHERE sigungu_code IS NOT NULL AND sigungu_code <> '') AS sigungu_coverage_sales,
    (SELECT COUNT(DISTINCT sigungu_code)
     FROM public.store_statistics
     WHERE sigungu_code IS NOT NULL AND sigungu_code <> '') AS sigungu_coverage_store
),
latest_months AS (
  SELECT
    (SELECT MAX(base_year_month) FROM public.business_statistics) AS latest_business_month,
    (SELECT MAX(base_year_month) FROM public.sales_statistics) AS latest_sales_month,
    (SELECT MAX(base_year_month) FROM public.store_statistics) AS latest_store_month
),
freshness AS (
  SELECT
    CASE
      WHEN latest_business_month ~ '^[0-9]{6}$' THEN
        (DATE_PART('year', NOW())::INT - SUBSTRING(latest_business_month, 1, 4)::INT) * 12 +
        (DATE_PART('month', NOW())::INT - SUBSTRING(latest_business_month, 5, 2)::INT)
      ELSE NULL
    END AS business_freshness_months,
    CASE
      WHEN latest_sales_month ~ '^[0-9]{6}$' THEN
        (DATE_PART('year', NOW())::INT - SUBSTRING(latest_sales_month, 1, 4)::INT) * 12 +
        (DATE_PART('month', NOW())::INT - SUBSTRING(latest_sales_month, 5, 2)::INT)
      ELSE NULL
    END AS sales_freshness_months,
    CASE
      WHEN latest_store_month ~ '^[0-9]{6}$' THEN
        (DATE_PART('year', NOW())::INT - SUBSTRING(latest_store_month, 1, 4)::INT) * 12 +
        (DATE_PART('month', NOW())::INT - SUBSTRING(latest_store_month, 5, 2)::INT)
      ELSE NULL
    END AS store_freshness_months
  FROM latest_months
)
SELECT
  sigungu_counts.sigungu_coverage_business,
  sigungu_counts.sigungu_coverage_sales,
  sigungu_counts.sigungu_coverage_store,
  latest_months.latest_business_month,
  latest_months.latest_sales_month,
  latest_months.latest_store_month,
  freshness.business_freshness_months,
  freshness.sales_freshness_months,
  freshness.store_freshness_months,
  GREATEST(
    COALESCE(freshness.business_freshness_months, 0),
    COALESCE(freshness.sales_freshness_months, 0),
    COALESCE(freshness.store_freshness_months, 0)
  )::INT AS freshness_months_max
FROM sigungu_counts
CROSS JOIN latest_months
CROSS JOIN freshness;

CREATE OR REPLACE VIEW public.vw_commercial_launch_gate AS
WITH latest_snapshot AS (
  SELECT *
  FROM public.commercial_quality_snapshots
  ORDER BY computed_at DESC
  LIMIT 1
),
coverage AS (
  SELECT *
  FROM public.vw_commercial_coverage_freshness
)
SELECT
  ls.id AS snapshot_id,
  ls.computed_at AS snapshot_computed_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - ls.computed_at)) / 3600.0, 2) AS snapshot_age_hours,
  ls.combo_count,
  ls.low_prob_high_confidence_count,
  ls.low_prob_high_confidence_ratio_pct,
  ls.high_prob_bucket_count,
  ls.high_prob_bucket_pct,
  coverage.sigungu_coverage_business,
  coverage.sigungu_coverage_sales,
  coverage.sigungu_coverage_store,
  coverage.freshness_months_max,
  ls.distribution_summary,
  ls.details,
  ls.pass AS snapshot_pass,
  (
    ls.low_prob_high_confidence_ratio_pct <= 3
    AND ls.high_prob_bucket_pct BETWEEN 5 AND 20
    AND LEAST(
      coverage.sigungu_coverage_business,
      coverage.sigungu_coverage_sales,
      coverage.sigungu_coverage_store
    ) >= 227
    AND coverage.freshness_months_max <= 3
    AND EXTRACT(EPOCH FROM (NOW() - ls.computed_at)) / 3600.0 <= 24
  ) AS gate_pass
FROM latest_snapshot ls
CROSS JOIN coverage;

