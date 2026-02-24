-- Migration 054: commercial quality snapshots

CREATE TABLE IF NOT EXISTS public.commercial_quality_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  combo_count INT NOT NULL DEFAULT 0,
  low_prob_high_confidence_count INT NOT NULL DEFAULT 0,
  low_prob_high_confidence_ratio_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  high_prob_bucket_count INT NOT NULL DEFAULT 0,
  high_prob_bucket_pct NUMERIC(6, 2) NOT NULL DEFAULT 0,
  sigungu_coverage_business INT NOT NULL DEFAULT 0,
  sigungu_coverage_sales INT NOT NULL DEFAULT 0,
  sigungu_coverage_store INT NOT NULL DEFAULT 0,
  freshness_months_max INT NOT NULL DEFAULT 0,
  distribution_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  pass BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_quality_snapshots_computed_at_desc
  ON public.commercial_quality_snapshots (computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_quality_snapshots_pass
  ON public.commercial_quality_snapshots (pass);

CREATE INDEX IF NOT EXISTS idx_commercial_quality_snapshots_freshness_months_max
  ON public.commercial_quality_snapshots (freshness_months_max);

