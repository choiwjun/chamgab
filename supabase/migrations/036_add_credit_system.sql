-- P7-BM-1: Credit-based billing model (multi-analysis products).
--
-- Credits are consumed per analysis product:
-- - commercial: 1 credit
-- - home_price: 2 credits
-- - land: 4 credits
--
-- Limits:
-- - daily_credit_limit: to prevent bursts/abuse
-- - monthly_credit_limit: subscription allowance
-- - bonus_credits: purchased/top-up credits (carry over); still capped by daily_credit_limit

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS daily_credit_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_credit_limit INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS daily_credit_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS monthly_credit_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_credit_limit INTEGER NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS monthly_credit_reset_at DATE NOT NULL DEFAULT (date_trunc('month', now())::date),
  ADD COLUMN IF NOT EXISTS bonus_credits INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_profiles.daily_credit_used IS '오늘 사용한 크레딧';
COMMENT ON COLUMN public.user_profiles.daily_credit_limit IS '일일 크레딧 한도';
COMMENT ON COLUMN public.user_profiles.monthly_credit_used IS '이번 달 사용한 크레딧';
COMMENT ON COLUMN public.user_profiles.monthly_credit_limit IS '월 크레딧 한도(구독 제공량)';
COMMENT ON COLUMN public.user_profiles.bonus_credits IS '추가 구매/보너스 크레딧(이월 가능)';

CREATE INDEX IF NOT EXISTS idx_user_profiles_credit_daily_reset
  ON public.user_profiles(daily_credit_reset_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_credit_monthly_reset
  ON public.user_profiles(monthly_credit_reset_at);

-- Ledger for auditing and refunds/topups.
CREATE TABLE IF NOT EXISTS public.credit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_events_user_created
  ON public.credit_events(user_id, created_at DESC);

ALTER TABLE public.credit_events ENABLE ROW LEVEL SECURITY;

-- Users can read own credit history.
DROP POLICY IF EXISTS "Users can read own credit events" ON public.credit_events;
CREATE POLICY "Users can read own credit events" ON public.credit_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read any credit events.
DROP POLICY IF EXISTS "Admins can read credit events" ON public.credit_events;
CREATE POLICY "Admins can read credit events" ON public.credit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
        AND au.is_active = TRUE
    )
  );

-- Service role can insert events.
DROP POLICY IF EXISTS "Service role can insert credit events" ON public.credit_events;
CREATE POLICY "Service role can insert credit events" ON public.credit_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- Atomic credit consumption (authenticated users).
CREATE OR REPLACE FUNCTION public.consume_user_credits(
  p_product TEXT,
  p_cost INTEGER DEFAULT 1,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  allowed BOOLEAN,
  daily_remaining INTEGER,
  monthly_remaining INTEGER,
  bonus_remaining INTEGER,
  total_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_daily_reset DATE;

  v_monthly_limit INTEGER;
  v_monthly_used INTEGER;
  v_monthly_reset DATE;
  v_month_start DATE := date_trunc('month', now())::date;

  v_bonus INTEGER;
  v_monthly_rem INTEGER;
  v_daily_rem INTEGER;
  v_from_month INTEGER;
  v_from_bonus INTEGER;
  v_unlimited_daily BOOLEAN := FALSE;
  v_unlimited_monthly BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_product IS NULL OR length(trim(p_product)) = 0 THEN
    RAISE EXCEPTION 'invalid_product';
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
  SELECT daily_credit_limit,
         daily_credit_used,
         daily_credit_reset_at,
         monthly_credit_limit,
         monthly_credit_used,
         monthly_credit_reset_at,
         bonus_credits
    INTO v_daily_limit,
         v_daily_used,
         v_daily_reset,
         v_monthly_limit,
         v_monthly_used,
         v_monthly_reset,
         v_bonus
  FROM public.user_profiles
  WHERE id = v_uid
  FOR UPDATE;

  -- Resets
  IF v_daily_reset IS NULL OR v_daily_reset < CURRENT_DATE THEN
    v_daily_used := 0;
    v_daily_reset := CURRENT_DATE;
  END IF;

  IF v_monthly_reset IS NULL OR v_monthly_reset < v_month_start THEN
    v_monthly_used := 0;
    v_monthly_reset := v_month_start;
  END IF;

  v_daily_limit := COALESCE(v_daily_limit, 0);
  v_monthly_limit := COALESCE(v_monthly_limit, 0);
  v_daily_used := COALESCE(v_daily_used, 0);
  v_monthly_used := COALESCE(v_monthly_used, 0);
  v_bonus := COALESCE(v_bonus, 0);

  v_unlimited_daily := v_daily_limit >= 999999;
  v_unlimited_monthly := v_monthly_limit >= 999999;

  -- Daily cap applies to all consumption (including bonus).
  IF NOT v_unlimited_daily AND (v_daily_used + p_cost) > v_daily_limit THEN
    allowed := FALSE;
    v_daily_rem := GREATEST(v_daily_limit - v_daily_used, 0);
    v_monthly_rem := CASE WHEN v_unlimited_monthly THEN 999999 ELSE GREATEST(v_monthly_limit - v_monthly_used, 0) END;
    daily_remaining := v_daily_rem;
    monthly_remaining := v_monthly_rem;
    bonus_remaining := v_bonus;
    total_remaining := v_daily_rem; -- daily is the real cap
    RETURN NEXT;
    RETURN;
  END IF;

  v_monthly_rem := CASE WHEN v_unlimited_monthly THEN 999999 ELSE GREATEST(v_monthly_limit - v_monthly_used, 0) END;
  v_daily_rem := CASE WHEN v_unlimited_daily THEN 999999 ELSE GREATEST(v_daily_limit - v_daily_used, 0) END;

  IF v_unlimited_monthly THEN
    v_from_month := p_cost;
    v_from_bonus := 0;
  ELSE
    IF (v_monthly_rem + v_bonus) < p_cost THEN
      allowed := FALSE;
      daily_remaining := v_daily_rem;
      monthly_remaining := v_monthly_rem;
      bonus_remaining := v_bonus;
      total_remaining := LEAST(v_daily_rem, v_monthly_rem + v_bonus);
      RETURN NEXT;
      RETURN;
    END IF;

    v_from_month := LEAST(v_monthly_rem, p_cost);
    v_from_bonus := p_cost - v_from_month;
  END IF;

  -- Apply changes
  v_daily_used := v_daily_used + p_cost;
  v_monthly_used := v_monthly_used + v_from_month;
  v_bonus := v_bonus - v_from_bonus;

  UPDATE public.user_profiles
    SET daily_credit_used = v_daily_used,
        daily_credit_reset_at = v_daily_reset,
        monthly_credit_used = v_monthly_used,
        monthly_credit_reset_at = v_monthly_reset,
        bonus_credits = v_bonus,
        -- Keep legacy counters roughly aligned (repurposed as "credit" usage for UI/backward compat).
        daily_analysis_count = v_daily_used,
        daily_analysis_limit = v_daily_limit
  WHERE id = v_uid;

  -- Ledger (service role policy is bypassed by SECURITY DEFINER).
  INSERT INTO public.credit_events(user_id, product, delta, reason, meta)
  VALUES (v_uid, p_product, -p_cost, 'consume', COALESCE(p_meta, '{}'::jsonb));

  allowed := TRUE;
  v_daily_rem := CASE WHEN v_unlimited_daily THEN 999999 ELSE GREATEST(v_daily_limit - v_daily_used, 0) END;
  v_monthly_rem := CASE WHEN v_unlimited_monthly THEN 999999 ELSE GREATEST(v_monthly_limit - v_monthly_used, 0) END;

  daily_remaining := v_daily_rem;
  monthly_remaining := v_monthly_rem;
  bonus_remaining := v_bonus;
  total_remaining := LEAST(v_daily_rem, v_monthly_rem + v_bonus);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_user_credits(TEXT, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_user_credits(TEXT, INTEGER, JSONB) TO authenticated, service_role;

-- Admin bonus grant (topups/manual adjustments).
CREATE OR REPLACE FUNCTION public.admin_grant_bonus_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'admin_grant',
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_admin_operator() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN;
  END IF;

  UPDATE public.user_profiles
    SET bonus_credits = GREATEST(bonus_credits + p_amount, 0)
  WHERE id = p_user_id;

  INSERT INTO public.credit_events(user_id, product, delta, reason, meta)
  VALUES (p_user_id, 'bonus', p_amount, COALESCE(p_reason, 'admin_grant'), COALESCE(p_meta, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_bonus_credits(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_bonus_credits(UUID, INTEGER, TEXT, JSONB) TO authenticated, service_role;

-- Backfill limits for existing rows based on tier.
UPDATE public.user_profiles
SET daily_credit_limit = CASE tier
      WHEN 'business' THEN 999999
      WHEN 'premium' THEN 200
      ELSE 20
    END,
    monthly_credit_limit = CASE tier
      WHEN 'business' THEN 999999
      WHEN 'premium' THEN 5000
      ELSE 400
    END
WHERE daily_credit_limit IS NULL
   OR monthly_credit_limit IS NULL
   OR daily_credit_limit = 0
   OR monthly_credit_limit = 0;
