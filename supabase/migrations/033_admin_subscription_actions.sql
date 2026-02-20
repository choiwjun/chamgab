-- P6-ADMIN-4: RPC helpers for operational subscription actions.

CREATE OR REPLACE FUNCTION public._is_admin_operator()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
      AND au.is_active = TRUE
      AND au.role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_force_cancel_subscription(
  p_subscription_id UUID,
  p_immediate BOOLEAN DEFAULT TRUE
)
RETURNS VOID AS $$
BEGIN
  IF NOT public._is_admin_operator() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_immediate THEN
    UPDATE public.subscriptions
    SET status = 'canceled',
        cancel_at_period_end = FALSE,
        canceled_at = NOW(),
        current_period_end = NOW()
    WHERE id = p_subscription_id;
  ELSE
    UPDATE public.subscriptions
    SET status = 'active',
        cancel_at_period_end = TRUE,
        canceled_at = NOW()
    WHERE id = p_subscription_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_force_expire_subscription(
  p_subscription_id UUID
)
RETURNS VOID AS $$
BEGIN
  IF NOT public._is_admin_operator() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.subscriptions
  SET status = 'expired',
      cancel_at_period_end = FALSE,
      current_period_end = NOW()
  WHERE id = p_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

