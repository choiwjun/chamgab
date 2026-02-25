-- Migration 057: Harden security linter findings in one pass.
-- Scope:
-- 1) Convert high-risk public views to SECURITY INVOKER.
-- 2) Enable RLS + baseline policies on public tables that were missing RLS.
--
-- Note:
-- - `public.spatial_ref_sys` is a PostGIS extension table and is intentionally
--   excluded from application-level RLS hardening in this migration.

-- ---------------------------------------------------------------------------
-- 1) Views: enforce invoker security context.
-- ---------------------------------------------------------------------------
ALTER VIEW IF EXISTS public.vw_school_analysis_preview
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.vw_academy_ecosystem_by_sigungu
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.vw_school_analysis_launch_gate
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.vw_commercial_launch_gate
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.vw_commercial_coverage_freshness
  SET (security_invoker = true);

ALTER VIEW IF EXISTS public.vw_school_quality_latest
  SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2) complexes: public read, service-role write.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'complexes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.complexes', p.policyname);
  END LOOP;
END
$$;

ALTER TABLE public.complexes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "complexes_select_public"
  ON public.complexes
  FOR SELECT
  USING (true);

CREATE POLICY "complexes_manage_service_role"
  ON public.complexes
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON TABLE public.complexes FROM anon, authenticated;
GRANT SELECT ON TABLE public.complexes TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) building_info: public read, service-role write.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'building_info'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.building_info',
      p.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.building_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "building_info_select_public"
  ON public.building_info
  FOR SELECT
  USING (true);

CREATE POLICY "building_info_manage_service_role"
  ON public.building_info
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON TABLE public.building_info FROM anon, authenticated;
GRANT SELECT ON TABLE public.building_info TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) land_collection_runs: admin read, service-role write.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'land_collection_runs'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.land_collection_runs',
      p.policyname
    );
  END LOOP;
END
$$;

ALTER TABLE public.land_collection_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "land_collection_runs_select_admin_or_service"
  ON public.land_collection_runs
  FOR SELECT
  USING (
    (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
    OR EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id = auth.uid()
        AND au.is_active = true
    )
  );

CREATE POLICY "land_collection_runs_manage_service_role"
  ON public.land_collection_runs
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE ALL ON TABLE public.land_collection_runs FROM anon;
GRANT SELECT ON TABLE public.land_collection_runs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.land_collection_runs FROM authenticated;

