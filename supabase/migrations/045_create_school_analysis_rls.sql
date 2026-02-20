-- Phase 7: School Analysis RLS and access controls

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable RLS
ALTER TABLE public.school_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_district_school_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_metrics_official ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_progression_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_analysis_share_tokens ENABLE ROW LEVEL SECURITY;

-- Helper expression note:
-- service role check uses either auth.role() or JWT role claim to support
-- Supabase service role sessions consistently.

-- ---------------------------------------------------------------------------
-- Collector-managed tables: service role only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Service role manage school_districts" ON public.school_districts;
CREATE POLICY "Service role manage school_districts" ON public.school_districts
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manage schools" ON public.schools;
CREATE POLICY "Service role manage schools" ON public.schools
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manage school_district_school_map" ON public.school_district_school_map;
CREATE POLICY "Service role manage school_district_school_map" ON public.school_district_school_map
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manage school_metrics_official" ON public.school_metrics_official;
CREATE POLICY "Service role manage school_metrics_official" ON public.school_metrics_official
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manage school_progression_stats" ON public.school_progression_stats;
CREATE POLICY "Service role manage school_progression_stats" ON public.school_progression_stats
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manage academies" ON public.academies;
CREATE POLICY "Service role manage academies" ON public.academies
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manage academy_fees" ON public.academy_fees;
CREATE POLICY "Service role manage academy_fees" ON public.academy_fees
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ---------------------------------------------------------------------------
-- User report tables: owner scope + service role
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own school analysis reports" ON public.school_analysis_reports;
CREATE POLICY "Users can read own school analysis reports" ON public.school_analysis_reports
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own school analysis reports" ON public.school_analysis_reports;
CREATE POLICY "Users can insert own school analysis reports" ON public.school_analysis_reports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own school analysis reports" ON public.school_analysis_reports;
CREATE POLICY "Users can update own school analysis reports" ON public.school_analysis_reports
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own school analysis reports" ON public.school_analysis_reports;
CREATE POLICY "Users can delete own school analysis reports" ON public.school_analysis_reports
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manage school analysis reports" ON public.school_analysis_reports;
CREATE POLICY "Service role manage school analysis reports" ON public.school_analysis_reports
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Users can read own school share tokens" ON public.school_analysis_share_tokens;
CREATE POLICY "Users can read own school share tokens" ON public.school_analysis_share_tokens
  FOR SELECT
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can insert own school share tokens" ON public.school_analysis_share_tokens;
CREATE POLICY "Users can insert own school share tokens" ON public.school_analysis_share_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update own school share tokens" ON public.school_analysis_share_tokens;
CREATE POLICY "Users can update own school share tokens" ON public.school_analysis_share_tokens
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete own school share tokens" ON public.school_analysis_share_tokens;
CREATE POLICY "Users can delete own school share tokens" ON public.school_analysis_share_tokens
  FOR DELETE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Service role manage school share tokens" ON public.school_analysis_share_tokens;
CREATE POLICY "Service role manage school share tokens" ON public.school_analysis_share_tokens
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ---------------------------------------------------------------------------
-- Public read access is restricted to vetted result functions only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_school_analysis_preview(
  p_district_code TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS SETOF public.vw_school_analysis_preview
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.vw_school_analysis_preview
  WHERE p_district_code IS NULL OR district_code = p_district_code
  ORDER BY overall_score DESC, district_code
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

CREATE OR REPLACE FUNCTION public.get_school_analysis_shared_report(
  p_token TEXT
)
RETURNS TABLE(
  report_id UUID,
  report_payload JSONB,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  data_freshness TIMESTAMPTZ,
  confidence_score NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    r.id AS report_id,
    r.report_payload,
    st.expires_at,
    st.revoked_at,
    (st.expires_at IS NOT NULL AND st.expires_at <= NOW()) AS is_expired,
    r.data_freshness,
    r.confidence_score
  FROM public.school_analysis_share_tokens st
  JOIN public.school_analysis_reports r
    ON r.id = st.report_id
  WHERE st.token_hash = encode(
    extensions.digest(
      convert_to(COALESCE(p_token, ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
  ORDER BY st.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_school_analysis_preview(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_school_analysis_shared_report(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_school_analysis_preview(TEXT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_analysis_shared_report(TEXT) TO anon, authenticated, service_role;
