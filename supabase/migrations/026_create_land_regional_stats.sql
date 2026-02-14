-- @TASK P6-LAND-T3 - Land regional stats RPC used by /land page
-- Computes lightweight regional aggregates from land_transactions.

CREATE OR REPLACE FUNCTION public.get_land_regional_stats(
  limit_count INT DEFAULT 6,
  in_land_category TEXT DEFAULT NULL
) RETURNS TABLE (
  region TEXT,
  sigungu TEXT,
  transaction_count BIGINT,
  avg_price_per_m2 NUMERIC,
  total_volume NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      sigungu,
      land_category,
      price_per_m2,
      price,
      transaction_date
    FROM public.land_transactions
    WHERE is_cancelled = false
      AND coalesce(is_partial_sale, false) = false
      AND price_per_m2 IS NOT NULL
      AND transaction_date >= (CURRENT_DATE - INTERVAL '365 days')
      AND (
        in_land_category IS NULL
        OR land_category = in_land_category
      )
  )
  SELECT
    filtered.sigungu AS region,
    filtered.sigungu,
    COUNT(*) AS transaction_count,
    ROUND(AVG(filtered.price_per_m2)) AS avg_price_per_m2,
    SUM(filtered.price) AS total_volume
  FROM filtered
  GROUP BY filtered.sigungu
  ORDER BY transaction_count DESC
  LIMIT LEAST(GREATEST(COALESCE(limit_count, 6), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_land_regional_stats(INT, TEXT) TO anon, authenticated;

