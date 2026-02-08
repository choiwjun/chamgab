-- 018: transactions 테이블에 수집 데이터 전체 컬럼 추가
-- CSV 의존성 제거 → Supabase에 모든 수집 데이터 영구 저장
-- 추가 컬럼: region_code, apt_name, built_year, jibun, sigungu

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS region_code VARCHAR(10);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS apt_name VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS built_year INT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS jibun VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sigungu VARCHAR(50);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_transactions_region_code ON transactions(region_code);
CREATE INDEX IF NOT EXISTS idx_transactions_sigungu ON transactions(sigungu);
CREATE INDEX IF NOT EXISTS idx_transactions_apt_name ON transactions(apt_name);

-- 복합 인덱스 (지역별 날짜 검색)
CREATE INDEX IF NOT EXISTS idx_transactions_sigungu_date ON transactions(sigungu, transaction_date DESC);

COMMENT ON COLUMN transactions.region_code IS '법정동 코드 (5자리)';
COMMENT ON COLUMN transactions.apt_name IS '아파트명';
COMMENT ON COLUMN transactions.built_year IS '건축년도';
COMMENT ON COLUMN transactions.jibun IS '지번';
COMMENT ON COLUMN transactions.sigungu IS '시군구명';
