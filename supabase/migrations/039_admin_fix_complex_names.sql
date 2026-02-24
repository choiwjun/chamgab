-- P3-DATA-2: Fix complexes.name quality using linked transactions' apt_name mode.
--
-- Problem:
-- - 일부 complexes.name 이 단지명이 아니라 주소/지번 형태로 들어가 UX/검색 품질이 떨어짐
-- - transactions.complex_id 링크가 채워진 뒤에는 complex_id별 apt_name 최빈값이
--   실제 단지명에 가장 근접한 경우가 많음
--
-- Strategy:
-- - "주소처럼 보이는" 단지명만 대상으로
-- - 최근 N일(기본 365) 거래의 apt_name 최빈값을 계산
-- - 충분한 표본(min_count)과 점유율(min_share) 조건을 만족할 때만 업데이트

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

