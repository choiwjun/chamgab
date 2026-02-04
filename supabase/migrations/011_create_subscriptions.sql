-- P4-R3: Subscriptions 테이블 생성
-- 구독 정보

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan VARCHAR(30) NOT NULL CHECK (plan IN ('premium_monthly', 'premium_yearly', 'business')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'pending')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  external_subscription_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_external ON subscriptions(external_subscription_id);

-- RLS 정책
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독만 조회 가능
CREATE POLICY "Users can read own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- 서비스에서만 구독 생성/수정 가능
CREATE POLICY "Service can manage subscriptions" ON subscriptions
  FOR ALL USING (true);

-- updated_at 자동 갱신
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 구독 상태 변경 시 user_profiles tier 업데이트 함수
CREATE OR REPLACE FUNCTION sync_user_tier_on_subscription()
RETURNS TRIGGER AS $$
DECLARE
  new_tier VARCHAR(20);
  new_limit INTEGER;
BEGIN
  -- 구독 플랜에 따른 tier 결정
  IF NEW.status = 'active' THEN
    CASE NEW.plan
      WHEN 'business' THEN
        new_tier := 'business';
        new_limit := 999999; -- 무제한
      WHEN 'premium_monthly', 'premium_yearly' THEN
        new_tier := 'premium';
        new_limit := 30;
      ELSE
        new_tier := 'free';
        new_limit := 3;
    END CASE;
  ELSE
    new_tier := 'free';
    new_limit := 3;
  END IF;

  -- user_profiles 업데이트
  UPDATE user_profiles
  SET tier = new_tier, daily_analysis_limit = new_limit
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_user_tier_trigger
  AFTER INSERT OR UPDATE OF status ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_user_tier_on_subscription();

COMMENT ON TABLE subscriptions IS '구독 정보';
COMMENT ON COLUMN subscriptions.plan IS '구독 플랜 (premium_monthly, premium_yearly, business)';
COMMENT ON COLUMN subscriptions.status IS '구독 상태 (active, canceled, expired, pending)';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS '기간 종료 시 취소 예정';
COMMENT ON COLUMN subscriptions.external_subscription_id IS '외부 결제 시스템 ID (Toss, Stripe 등)';
