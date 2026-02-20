-- P6-ADMIN-3: Log all analysis attempts (success/failure) for operations.

CREATE TABLE IF NOT EXISTS public.chamgab_analysis_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.chamgab_analyses(id) ON DELETE SET NULL,
  actor_user_id UUID,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  http_status INT,
  error_code TEXT,
  error_message TEXT,
  request JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chamgab_analysis_events_property_created
  ON public.chamgab_analysis_events(property_id, created_at DESC);

ALTER TABLE public.chamgab_analysis_events ENABLE ROW LEVEL SECURITY;

-- Admins can read events.
DROP POLICY IF EXISTS "Admins can read analysis events" ON public.chamgab_analysis_events;
CREATE POLICY "Admins can read analysis events" ON public.chamgab_analysis_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
        AND au.is_active = TRUE
    )
  );

-- Service role can insert events.
DROP POLICY IF EXISTS "Service role can insert analysis events" ON public.chamgab_analysis_events;
CREATE POLICY "Service role can insert analysis events" ON public.chamgab_analysis_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.chamgab_analysis_events IS '참값 분석 실행 이벤트(성공/실패) 로그';

