-- Security baseline enforcement for sensitive analytics tables.
-- This migration drops all existing policies on target tables to prevent
-- legacy/vulnerable policies from lingering under unexpected names.

-- ---------------------------------------------------------------------------
-- sigungu_advancement_stats: public read only, service role manages writes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sigungu_advancement_stats'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.sigungu_advancement_stats',
      p.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.sigungu_advancement_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sas_select_public" ON public.sigungu_advancement_stats
  FOR SELECT
  USING (true);

CREATE POLICY "sas_manage_service_role" ON public.sigungu_advancement_stats
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON TABLE public.sigungu_advancement_stats FROM anon, authenticated;
GRANT SELECT ON TABLE public.sigungu_advancement_stats TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- chamgab_analyses: service role only.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chamgab_analyses'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.chamgab_analyses',
      p.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.chamgab_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chamgab_manage_service_role" ON public.chamgab_analyses
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE ALL ON TABLE public.chamgab_analyses FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- price_factors: service role only.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'price_factors'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.price_factors',
      p.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.price_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_factors_manage_service_role" ON public.price_factors
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE ALL ON TABLE public.price_factors FROM anon, authenticated;

