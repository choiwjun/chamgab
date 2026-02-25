-- Security hardening: remove public/anonymous write paths from sensitive tables.

-- ---------------------------------------------------------------------------
-- sigungu_advancement_stats: keep public read, service role manages writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sigungu_advancement_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sas_insert_service" ON public.sigungu_advancement_stats;
DROP POLICY IF EXISTS "sas_update_service" ON public.sigungu_advancement_stats;
DROP POLICY IF EXISTS "sas_delete_service" ON public.sigungu_advancement_stats;
DROP POLICY IF EXISTS "sas_manage_service_role" ON public.sigungu_advancement_stats;

CREATE POLICY "sas_manage_service_role" ON public.sigungu_advancement_stats
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ---------------------------------------------------------------------------
-- chamgab_analyses: no direct client read/write, only service role.
-- API routes mediate access and redact sensitive fields.
-- ---------------------------------------------------------------------------
ALTER TABLE public.chamgab_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read chamgab analyses" ON public.chamgab_analyses;
DROP POLICY IF EXISTS "Authenticated users can insert analyses" ON public.chamgab_analyses;
DROP POLICY IF EXISTS "Service role manage chamgab analyses" ON public.chamgab_analyses;

CREATE POLICY "Service role manage chamgab analyses" ON public.chamgab_analyses
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ---------------------------------------------------------------------------
-- price_factors: no direct client read/write, only service role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.price_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read price factors" ON public.price_factors;
DROP POLICY IF EXISTS "System can insert price factors" ON public.price_factors;
DROP POLICY IF EXISTS "Service role can insert price factors" ON public.price_factors;
DROP POLICY IF EXISTS "Service role manage price factors" ON public.price_factors;

CREATE POLICY "Service role manage price factors" ON public.price_factors
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

