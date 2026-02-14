-- P7-BM-2: Keep credit limits in sync with subscription status/plan.

CREATE OR REPLACE FUNCTION public.sync_user_tier_on_subscription()
RETURNS TRIGGER AS $$
DECLARE
  new_tier VARCHAR(20);
  legacy_limit INTEGER;
  daily_credits INTEGER;
  monthly_credits INTEGER;
BEGIN
  -- Determine tier/limits from subscription.
  IF NEW.status = 'active' THEN
    CASE NEW.plan
      WHEN 'business' THEN
        new_tier := 'business';
        legacy_limit := 999999;
        daily_credits := 999999;
        monthly_credits := 999999;
      WHEN 'premium_monthly', 'premium_yearly' THEN
        new_tier := 'premium';
        legacy_limit := 30;
        daily_credits := 200;
        monthly_credits := 5000;
      ELSE
        new_tier := 'free';
        legacy_limit := 3;
        daily_credits := 20;
        monthly_credits := 400;
    END CASE;
  ELSE
    new_tier := 'free';
    legacy_limit := 3;
    daily_credits := 20;
    monthly_credits := 400;
  END IF;

  UPDATE public.user_profiles
  SET tier = new_tier,
      -- Legacy fields kept for backward compatibility in UI/API.
      daily_analysis_limit = legacy_limit,
      -- Credit-based limits.
      daily_credit_limit = daily_credits,
      monthly_credit_limit = monthly_credits
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Touch all active subscriptions to sync credits (idempotent).
UPDATE public.subscriptions
SET status = status,
    updated_at = NOW()
WHERE status IN ('active', 'canceled', 'expired', 'pending');
