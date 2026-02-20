-- @TASK SEARCH-1 - Search suggestion/query stats for ranking
-- Lightweight counters only (no IP/user-agent stored).

CREATE TABLE IF NOT EXISTS search_suggestion_stats (
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('region', 'complex', 'property', 'keyword')),
  suggestion_id UUID,
  suggestion_name TEXT NOT NULL,
  suggestion_key TEXT GENERATED ALWAYS AS (COALESCE(suggestion_id::text, suggestion_name)) STORED,
  click_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (suggestion_type, suggestion_key)
);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_stats_clicks
  ON search_suggestion_stats (click_count DESC);

CREATE INDEX IF NOT EXISTS idx_search_suggestion_stats_name
  ON search_suggestion_stats (suggestion_type, suggestion_name);

ALTER TABLE search_suggestion_stats ENABLE ROW LEVEL SECURITY;

-- Public read of aggregated counters is acceptable.
DROP POLICY IF EXISTS "Public read search_suggestion_stats" ON search_suggestion_stats;
CREATE POLICY "Public read search_suggestion_stats" ON search_suggestion_stats
  FOR SELECT USING (true);

-- RPC: increment suggestion click (security definer to avoid opening UPDATE policy)
CREATE OR REPLACE FUNCTION public.increment_search_suggestion_click(
  in_suggestion_type TEXT,
  in_suggestion_id UUID,
  in_suggestion_name TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF in_suggestion_type IS NULL OR length(trim(in_suggestion_type)) = 0 THEN
    RETURN;
  END IF;

  IF in_suggestion_name IS NULL OR length(trim(in_suggestion_name)) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_suggestion_stats (suggestion_type, suggestion_id, suggestion_name, click_count)
  VALUES (in_suggestion_type, in_suggestion_id, left(trim(in_suggestion_name), 200), 1)
  ON CONFLICT (suggestion_type, suggestion_key)
  DO UPDATE SET
    click_count = public.search_suggestion_stats.click_count + 1,
    suggestion_name = excluded.suggestion_name,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_search_suggestion_click(TEXT, UUID, TEXT) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS search_query_stats (
  query_text TEXT NOT NULL,
  query_key TEXT GENERATED ALWAYS AS (lower(trim(query_text))) STORED,
  search_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (query_key)
);

CREATE INDEX IF NOT EXISTS idx_search_query_stats_count
  ON search_query_stats (search_count DESC);

ALTER TABLE search_query_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read search_query_stats" ON search_query_stats;
CREATE POLICY "Public read search_query_stats" ON search_query_stats
  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.increment_search_query(
  in_query_text TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT;
BEGIN
  q := left(trim(coalesce(in_query_text, '')), 200);
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_query_stats (query_text, search_count)
  VALUES (q, 1)
  ON CONFLICT (query_key)
  DO UPDATE SET
    search_count = public.search_query_stats.search_count + 1,
    query_text = excluded.query_text,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_search_query(TEXT) TO anon, authenticated;

