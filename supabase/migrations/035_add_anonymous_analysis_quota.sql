-- P6-SEC-2: Anonymous analysis quota (per IP hash, daily) to prevent abuse.

CREATE TABLE IF NOT EXISTS public.anonymous_analysis_usage (
  ip_hash TEXT PRIMARY KEY,
  daily_count INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 3,
  daily_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anonymous_analysis_usage_reset_at
  ON public.anonymous_analysis_usage(daily_reset_at);

ALTER TABLE public.anonymous_analysis_usage ENABLE ROW LEVEL SECURITY;

-- No client access. Only service role should read/write.
DROP POLICY IF EXISTS "Service role can manage anonymous usage" ON public.anonymous_analysis_usage;
CREATE POLICY "Service role can manage anonymous usage" ON public.anonymous_analysis_usage
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE public.anonymous_analysis_usage IS '비로그인 분석 호출 제한(일 단위, IP hash 기준)';

CREATE OR REPLACE FUNCTION public.consume_anonymous_analysis_quota(
  p_ip_hash TEXT,
  p_cost INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE(
  allowed BOOLEAN,
  remaining INTEGER,
  daily_limit INTEGER,
  daily_used INTEGER,
  reset_at DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_reset DATE;
BEGIN
  IF p_ip_hash IS NULL OR length(trim(p_ip_hash)) < 8 THEN
    RAISE EXCEPTION 'invalid_ip_hash';
  END IF;

  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_cost';
  END IF;

  IF p_limit IS NULL OR p_limit <= 0 THEN
    p_limit := 3;
  END IF;

  INSERT INTO public.anonymous_analysis_usage (ip_hash, daily_count, daily_limit, daily_reset_at)
  VALUES (p_ip_hash, 0, p_limit, CURRENT_DATE)
  ON CONFLICT (ip_hash) DO NOTHING;

  SELECT daily_limit, daily_count, daily_reset_at
    INTO v_limit, v_used, v_reset
  FROM public.anonymous_analysis_usage
  WHERE ip_hash = p_ip_hash
  FOR UPDATE;

  IF v_reset IS NULL OR v_reset < CURRENT_DATE THEN
    v_used := 0;
    v_reset := CURRENT_DATE;
    UPDATE public.anonymous_analysis_usage
      SET daily_count = 0,
          daily_reset_at = CURRENT_DATE,
          updated_at = NOW()
    WHERE ip_hash = p_ip_hash;
  END IF;

  v_limit := COALESCE(v_limit, p_limit);
  v_used := COALESCE(v_used, 0);

  IF (v_used + p_cost) <= v_limit THEN
    v_used := v_used + p_cost;
    UPDATE public.anonymous_analysis_usage
      SET daily_count = v_used,
          daily_limit = v_limit,
          updated_at = NOW()
    WHERE ip_hash = p_ip_hash;
    allowed := TRUE;
  ELSE
    allowed := FALSE;
  END IF;

  daily_limit := v_limit;
  daily_used := v_used;
  reset_at := v_reset;
  remaining := GREATEST(v_limit - v_used, 0);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_anonymous_analysis_quota(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_anonymous_analysis_quota(TEXT, INTEGER, INTEGER) TO service_role;

