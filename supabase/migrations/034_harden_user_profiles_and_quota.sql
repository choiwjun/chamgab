-- P6-ADMIN-5 / P4-R1: Harden user_profiles updates + atomic quota RPC + RPC privilege hardening.

-- 1) Operational forced logout marker.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS force_logout_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.force_logout_at IS
  '운영 강제 로그아웃 기준 시각(이 시각 이전 로그인 세션은 차단)';

CREATE INDEX IF NOT EXISTS idx_user_profiles_force_logout_at
  ON public.user_profiles(force_logout_at);

-- 2) Tighten UPDATE policy + restrict columns that authenticated users can mutate.
-- Note: RLS checks *rows*, column-level GRANTs restrict *which fields* can be updated.
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON TABLE public.user_profiles FROM anon, authenticated;
GRANT UPDATE (name, avatar_url, phone, notification_settings) ON TABLE public.user_profiles TO authenticated;

-- Ensure backend/service operations keep working.
GRANT UPDATE ON TABLE public.user_profiles TO service_role;

-- 3) Atomic daily quota consumption.
-- Uses auth.uid() and row-level lock to avoid race conditions under concurrency.
CREATE OR REPLACE FUNCTION public.consume_daily_analysis_quota(
  p_cost INTEGER DEFAULT 1
)
RETURNS TABLE(
  allowed BOOLEAN,
  remaining INTEGER,
  daily_limit INTEGER,
  daily_used INTEGER,
  reset_at DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INTEGER;
  v_used INTEGER;
  v_reset DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_cost IS NULL OR p_cost <= 0 THEN
    RAISE EXCEPTION 'invalid_cost';
  END IF;

  -- Ensure profile exists even if the signup trigger missed for some reason.
  INSERT INTO public.user_profiles (id, email, name)
  SELECT u.id,
         u.email,
         COALESCE(
           u.raw_user_meta_data->>'name',
           u.raw_user_meta_data->>'full_name',
           split_part(u.email, '@', 1)
         )
  FROM auth.users u
  WHERE u.id = v_uid
  ON CONFLICT (id) DO NOTHING;

  -- Lock row for atomic check + increment.
  SELECT daily_analysis_limit, daily_analysis_count, daily_analysis_reset_at
    INTO v_limit, v_used, v_reset
  FROM public.user_profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF v_reset IS NULL OR v_reset < CURRENT_DATE THEN
    v_used := 0;
    v_reset := CURRENT_DATE;
    UPDATE public.user_profiles
      SET daily_analysis_count = 0,
          daily_analysis_reset_at = CURRENT_DATE
    WHERE id = v_uid;
  END IF;

  v_limit := COALESCE(v_limit, 0);
  v_used := COALESCE(v_used, 0);

  IF (v_used + p_cost) <= v_limit THEN
    v_used := v_used + p_cost;
    UPDATE public.user_profiles
      SET daily_analysis_count = v_used
    WHERE id = v_uid;
    allowed := TRUE;
  ELSE
    allowed := FALSE;
  END IF;

  daily_limit := v_limit;
  daily_used := v_used;
  reset_at := v_reset;
  remaining := GREATEST(v_limit - v_used, 0);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_analysis_quota(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_daily_analysis_quota(INTEGER) TO authenticated, service_role;

-- 4) Explicitly harden admin RPC execute privileges (Postgres defaults to PUBLIC).
REVOKE ALL ON FUNCTION public._is_admin_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_force_cancel_subscription(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_force_expire_subscription(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public._is_admin_operator() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_cancel_subscription(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_expire_subscription(UUID) TO authenticated, service_role;

