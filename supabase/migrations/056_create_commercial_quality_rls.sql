-- Migration 056: commercial quality snapshot RLS

ALTER TABLE public.commercial_quality_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manage commercial quality snapshots"
  ON public.commercial_quality_snapshots;
CREATE POLICY "Service role manage commercial quality snapshots"
  ON public.commercial_quality_snapshots
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- No direct anon/authenticated read. Access is served through admin API routes.
REVOKE ALL ON TABLE public.commercial_quality_snapshots FROM anon, authenticated;

