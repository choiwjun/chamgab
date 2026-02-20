-- P6-SEC-1: Harden RLS policies that were intended to be "service-only".
-- Fixes unsafe policies like `FOR ALL USING (true)` / `FOR INSERT WITH CHECK (true)`
-- which allow any authenticated client to write.

-- ============================================================================
-- subscriptions
-- ============================================================================

-- Remove unsafe policy
DROP POLICY IF EXISTS "Service can manage subscriptions" ON public.subscriptions;

-- Ensure users can still read their own subscriptions
-- (keep existing policy if present)
-- "Users can read own subscriptions" is created in 011_create_subscriptions.sql

-- Only service role can insert/update/delete.
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- payments
-- ============================================================================

DROP POLICY IF EXISTS "Service can manage payments" ON public.payments;

-- "Users can read own payments" is created in 012_create_payments.sql

DROP POLICY IF EXISTS "Service role can manage payments" ON public.payments;
CREATE POLICY "Service role can manage payments" ON public.payments
  FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- notifications (system-generated)
-- ============================================================================

-- This policy was documented as service-only but allowed any client to insert.
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- price_indices / poi_data (collector-managed)
-- ============================================================================

DROP POLICY IF EXISTS "Service can insert price_indices" ON public.price_indices;
DROP POLICY IF EXISTS "Service can update price_indices" ON public.price_indices;
CREATE POLICY "Service role can insert price_indices" ON public.price_indices
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Service role can update price_indices" ON public.price_indices
  FOR UPDATE
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "Service can insert poi_data" ON public.poi_data;
DROP POLICY IF EXISTS "Service can update poi_data" ON public.poi_data;
CREATE POLICY "Service role can insert poi_data" ON public.poi_data
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Service role can update poi_data" ON public.poi_data
  FOR UPDATE
  USING (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- price_factors (system-generated via ML pipeline)
-- ============================================================================

DROP POLICY IF EXISTS "System can insert price factors" ON public.price_factors;
CREATE POLICY "Service role can insert price factors" ON public.price_factors
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.jwt()->>'role' = 'service_role');

