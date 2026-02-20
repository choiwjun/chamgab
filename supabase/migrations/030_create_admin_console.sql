-- P6-ADMIN-1: Admin console foundation (roles + audit logs).
-- "Official" admin should not rely on env allowlists; use admin_users.

-- ============================================================================
-- admin_users (who can access /admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('viewer', 'admin', 'super_admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Users can read their own admin membership (for gating).
DROP POLICY IF EXISTS "Admin user can read own membership" ON public.admin_users;
CREATE POLICY "Admin user can read own membership" ON public.admin_users
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can manage admin memberships.
DROP POLICY IF EXISTS "Service role can manage admin_users" ON public.admin_users;
CREATE POLICY "Service role can manage admin_users" ON public.admin_users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_users IS '관리자 계정 (관리자 콘솔 접근 권한)';
COMMENT ON COLUMN public.admin_users.role IS 'viewer/admin/super_admin';
COMMENT ON COLUMN public.admin_users.is_active IS '활성 여부';

-- ============================================================================
-- admin_audit_logs (admin actions trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  request JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs.
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs" ON public.admin_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id = auth.uid()
        AND au.is_active = TRUE
    )
  );

-- Only service role can insert audit logs.
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Service role can insert audit logs" ON public.admin_audit_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_audit_logs IS '관리자 작업 감사 로그';

