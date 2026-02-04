-- P4-R4: Payments 테이블 생성
-- 결제 내역

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'KRW',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'canceled')),
  payment_method VARCHAR(50),
  external_payment_id VARCHAR(100),
  description VARCHAR(200),
  metadata JSONB DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_external ON payments(external_payment_id);

-- RLS 정책
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 본인 결제 내역만 조회 가능
CREATE POLICY "Users can read own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- 서비스에서만 결제 생성/수정 가능
CREATE POLICY "Service can manage payments" ON payments
  FOR ALL USING (true);

COMMENT ON TABLE payments IS '결제 내역';
COMMENT ON COLUMN payments.amount IS '결제 금액 (원)';
COMMENT ON COLUMN payments.status IS '결제 상태 (pending, completed, failed, refunded, canceled)';
COMMENT ON COLUMN payments.external_payment_id IS '외부 결제 시스템 결제 ID';
COMMENT ON COLUMN payments.metadata IS '추가 데이터 (영수증 URL, 카드 정보 등)';
