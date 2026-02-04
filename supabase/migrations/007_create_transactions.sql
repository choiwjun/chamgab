-- P3-R3: Transactions 테이블 생성
-- 실거래가 데이터 저장

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  complex_id UUID REFERENCES complexes(id),
  transaction_date DATE NOT NULL,
  price BIGINT NOT NULL,
  area_exclusive DECIMAL(10,2),
  floor INT,
  dong VARCHAR(50),
  buyer_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_transactions_property ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_complex ON transactions(complex_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_price ON transactions(price);

-- 공간 검색을 위한 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_transactions_complex_date ON transactions(complex_id, transaction_date DESC);

-- RLS 정책
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read transactions" ON transactions
  FOR SELECT USING (true);

COMMENT ON TABLE transactions IS '아파트 실거래가 데이터';
COMMENT ON COLUMN transactions.price IS '거래가격 (원)';
COMMENT ON COLUMN transactions.area_exclusive IS '전용면적 (㎡)';
COMMENT ON COLUMN transactions.floor IS '층수';
COMMENT ON COLUMN transactions.dong IS '동';
COMMENT ON COLUMN transactions.buyer_type IS '매수자 유형';
