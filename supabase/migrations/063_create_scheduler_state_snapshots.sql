CREATE TABLE IF NOT EXISTS public.scheduler_state_snapshots (
  service_name TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_state_snapshots_updated_at
  ON public.scheduler_state_snapshots (updated_at DESC);

CREATE OR REPLACE FUNCTION public.update_scheduler_state_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_scheduler_state_snapshots_updated_at
  ON public.scheduler_state_snapshots;

CREATE TRIGGER trigger_update_scheduler_state_snapshots_updated_at
  BEFORE UPDATE ON public.scheduler_state_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduler_state_snapshots_updated_at();

ALTER TABLE public.scheduler_state_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduler_state_snapshots_select_admin_or_service"
  ON public.scheduler_state_snapshots;
CREATE POLICY "scheduler_state_snapshots_select_admin_or_service"
  ON public.scheduler_state_snapshots
  FOR SELECT
  USING (
    (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
    OR EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id = auth.uid()
        AND au.is_active = true
    )
  );

DROP POLICY IF EXISTS "scheduler_state_snapshots_manage_service_role"
  ON public.scheduler_state_snapshots;
CREATE POLICY "scheduler_state_snapshots_manage_service_role"
  ON public.scheduler_state_snapshots
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

REVOKE ALL ON TABLE public.scheduler_state_snapshots FROM anon;
GRANT SELECT ON TABLE public.scheduler_state_snapshots TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.scheduler_state_snapshots FROM authenticated;

COMMENT ON TABLE public.scheduler_state_snapshots IS
  'ML scheduler latest state snapshot persisted across redeploys';
