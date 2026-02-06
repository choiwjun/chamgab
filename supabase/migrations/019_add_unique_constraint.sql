-- 019: transactions 중복 방지용 unique constraint
-- 같은 날짜+지역+아파트+면적+층+가격 = 동일 거래
-- UPSERT (ON CONFLICT DO NOTHING)에 사용

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_dedup
  ON transactions(transaction_date, region_code, apt_name, area_exclusive, floor, price)
  WHERE region_code IS NOT NULL AND apt_name IS NOT NULL;

COMMENT ON INDEX idx_transactions_dedup IS '수집 데이터 중복 방지용 (UPSERT)';
