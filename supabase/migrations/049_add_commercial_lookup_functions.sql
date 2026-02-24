-- Security/performance hardening:
-- expose compact distinct code lookups through SQL functions
-- to avoid large paginated table scans from public API routes.

CREATE OR REPLACE FUNCTION public.get_commercial_sigungu_codes()
RETURNS TABLE(sigungu_code TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT bs.sigungu_code::TEXT
  FROM public.business_statistics bs
  WHERE bs.sigungu_code IS NOT NULL
    AND bs.sigungu_code <> ''
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_commercial_industry_codes()
RETURNS TABLE(industry_small_code TEXT, industry_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bs.industry_small_code::TEXT,
    MAX(COALESCE(bs.industry_name, ''))::TEXT AS industry_name
  FROM public.business_statistics bs
  WHERE bs.industry_small_code IS NOT NULL
    AND bs.industry_small_code <> ''
  GROUP BY bs.industry_small_code
  ORDER BY bs.industry_small_code;
$$;

REVOKE ALL ON FUNCTION public.get_commercial_sigungu_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_commercial_industry_codes() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_commercial_sigungu_codes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_industry_codes() TO anon, authenticated, service_role;

