-- @TASK P6-LAND-DATA-2 - Month-level land collection bookkeeping for reliable resume
-- Tracks region_code + deal_ymd collection status (success/no_data/error) so the
-- collector can resume safely without skipping partially collected regions.

CREATE TABLE IF NOT EXISTS public.land_collection_runs (
  region_code VARCHAR(10) NOT NULL,
  deal_ymd VARCHAR(6) NOT NULL, -- YYYYMM
  region_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'no_data', 'error')),
  total_count INT,
  fetched_count INT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (region_code, deal_ymd)
);

CREATE INDEX IF NOT EXISTS idx_land_collection_runs_status_updated
  ON public.land_collection_runs (status, updated_at DESC);

