-- P3-R2: Price Factors 테이블 생성
-- SHAP 분석 기반 가격 요인 저장

CREATE TABLE IF NOT EXISTS price_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES chamgab_analyses(id) ON DELETE CASCADE NOT NULL,
  rank INT NOT NULL CHECK (rank >= 1 AND rank <= 20),
  factor_name VARCHAR(100) NOT NULL,
  factor_name_ko VARCHAR(100) NOT NULL,
  contribution BIGINT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('positive', 'negative')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_factors_analysis ON price_factors(analysis_id);
CREATE INDEX IF NOT EXISTS idx_factors_rank ON price_factors(analysis_id, rank);

-- RLS 정책
ALTER TABLE price_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read price factors" ON price_factors
  FOR SELECT USING (true);

CREATE POLICY "System can insert price factors" ON price_factors
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE price_factors IS 'SHAP 기반 가격 요인 분석 테이블';
COMMENT ON COLUMN price_factors.factor_name IS '요인명 (영문)';
COMMENT ON COLUMN price_factors.factor_name_ko IS '요인명 (한글)';
COMMENT ON COLUMN price_factors.contribution IS '가격 기여도 (원, 양수/음수)';
COMMENT ON COLUMN price_factors.direction IS '기여 방향 (positive: 상승, negative: 하락)';
