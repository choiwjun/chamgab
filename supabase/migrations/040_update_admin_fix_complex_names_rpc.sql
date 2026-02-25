-- P3-DATA-2b: Expand "suspicious complex name" detection for name backfill RPC.
--
-- This keeps the same function signature as 039, but broadens the predicate to catch:
-- - Full-address names starting with a province/city prefix (e.g., "서울특별시 ...")
-- - 읍/면/동/리 + 지번 숫자 패턴 (e.g., "방학동 271", "토성면 청간리 217")

CREATE OR REPLACE FUNCTION public.admin_backfill_complex_names_from_transactions(
  p_since_days INTEGER DEFAULT 365,
  p_min_count INTEGER DEFAULT 3,
  p_min_share NUMERIC DEFAULT 0.60,
  p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  updated_count INTEGER,
  samples JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnt INTEGER := 0;
  v_samples JSONB := '[]'::jsonb;
BEGIN
  IF NOT public._is_admin_operator() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_since_days IS NULL OR p_since_days < 0 THEN
    RAISE EXCEPTION 'invalid_since_days';
  END IF;
  IF p_min_count IS NULL OR p_min_count <= 0 THEN
    RAISE EXCEPTION 'invalid_min_count';
  END IF;
  IF p_min_share IS NULL OR p_min_share <= 0 OR p_min_share > 1 THEN
    RAISE EXCEPTION 'invalid_min_share';
  END IF;

  WITH suspicious AS (
    SELECT c.id, c.name, c.address
    FROM public.complexes c
    WHERE
      c.name = c.address
      OR c.name ~ '([0-9]{1,4}-[0-9]{1,4})'
      OR c.name ~ '((대로|로|길|번길)\\s*[0-9]{1,4})'
      OR c.name ~ '(^|\\s)[0-9]{1,4}번지'
      OR c.name ~ '((동|읍|면|리)\\s*[0-9]{1,4}(-[0-9]{1,4})?)'
      OR c.name ~ '^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)'
  ),
  tx AS (
    SELECT
      t.complex_id,
      btrim(t.apt_name) AS apt_name
    FROM public.transactions t
    JOIN suspicious s ON s.id = t.complex_id
    WHERE
      t.apt_name IS NOT NULL
      AND btrim(t.apt_name) <> ''
      AND (p_since_days = 0 OR t.transaction_date >= (CURRENT_DATE - p_since_days))
  ),
  counts AS (
    SELECT complex_id, apt_name, COUNT(*)::INT AS cnt
    FROM tx
    GROUP BY 1, 2
  ),
  ranked AS (
    SELECT
      c.complex_id,
      c.apt_name,
      c.cnt,
      SUM(c.cnt) OVER (PARTITION BY c.complex_id) AS total_cnt,
      ROW_NUMBER() OVER (PARTITION BY c.complex_id ORDER BY c.cnt DESC, c.apt_name ASC) AS rn
    FROM counts c
  ),
  best AS (
    SELECT
      r.complex_id,
      r.apt_name AS best_name,
      r.cnt AS best_cnt,
      r.total_cnt,
      (r.cnt::NUMERIC / NULLIF(r.total_cnt, 0)) AS share
    FROM ranked r
    WHERE r.rn = 1
  ),
  candidates AS (
    SELECT
      s.id AS complex_id,
      s.name AS old_name,
      b.best_name,
      b.best_cnt,
      b.total_cnt,
      b.share
    FROM suspicious s
    JOIN best b ON b.complex_id = s.id
    WHERE
      b.best_cnt >= p_min_count
      AND b.share >= p_min_share
      AND b.best_name <> s.name
      -- Avoid applying an "address-like" apt_name.
      AND NOT (
        b.best_name ~ '([0-9]{1,4}-[0-9]{1,4})'
        OR b.best_name ~ '((대로|로|길|번길)\\s*[0-9]{1,4})'
        OR b.best_name ~ '(^|\\s)[0-9]{1,4}번지'
        OR b.best_name ~ '((동|읍|면|리)\\s*[0-9]{1,4}(-[0-9]{1,4})?)'
        OR b.best_name ~ '^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)'
      )
  ),
  s AS (
    SELECT
      COUNT(*)::INT AS cnt,
      COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'complex_id', complex_id,
            'old_name', old_name,
            'new_name', best_name,
            'best_cnt', best_cnt,
            'total_cnt', total_cnt,
            'share', share
          )
        ) FILTER (WHERE rn <= 10),
        '[]'::jsonb
      ) AS samples
    FROM (
      SELECT c.*, ROW_NUMBER() OVER (ORDER BY share DESC, best_cnt DESC) AS rn
      FROM candidates c
    ) c
  )
  SELECT s.cnt, s.samples INTO v_cnt, v_samples FROM s;

  IF p_dry_run THEN
    updated_count := v_cnt;
    samples := v_samples;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.complexes c
  SET name = cand.best_name,
      updated_at = NOW()
  FROM (
    SELECT complex_id, best_name
    FROM candidates
  ) cand
  WHERE c.id = cand.complex_id;

  updated_count := v_cnt;
  samples := v_samples;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_complex_names_from_transactions(INTEGER, INTEGER, NUMERIC, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_backfill_complex_names_from_transactions(INTEGER, INTEGER, NUMERIC, BOOLEAN) TO authenticated, service_role;

