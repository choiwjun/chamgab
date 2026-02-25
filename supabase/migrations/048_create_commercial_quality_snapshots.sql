-- Commercial quality snapshot history for launch-readiness gate.

CREATE TABLE IF NOT EXISTS public.commercial_quality_snapshots (
  id BIGSERIAL PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  combo_count INTEGER NOT NULL DEFAULT 0,
  low_prob_high_confidence_count INTEGER NOT NULL DEFAULT 0,
  low_prob_high_confidence_ratio_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
  high_prob_bucket_count INTEGER NOT NULL DEFAULT 0,
  high_prob_bucket_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
  sigungu_coverage_business INTEGER NOT NULL DEFAULT 0,
  sigungu_coverage_sales INTEGER NOT NULL DEFAULT 0,
  sigungu_coverage_store INTEGER NOT NULL DEFAULT 0,
  freshness_months_max NUMERIC(8, 2) NOT NULL DEFAULT 0,
  distribution_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  pass BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_quality_snapshots_computed_at
  ON public.commercial_quality_snapshots(computed_at DESC);

ALTER TABLE public.commercial_quality_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access commercial quality snapshots"
  ON public.commercial_quality_snapshots;
CREATE POLICY "Service role full access commercial quality snapshots"
  ON public.commercial_quality_snapshots
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Admins can read commercial quality snapshots"
  ON public.commercial_quality_snapshots;
CREATE POLICY "Admins can read commercial quality snapshots"
  ON public.commercial_quality_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id = auth.uid()
        AND au.is_active = true
    )
  );
