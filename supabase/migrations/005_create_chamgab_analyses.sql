-- P3-R1: Chamgab Analyses 테이블 생성
-- 참값 분석 결과를 저장하는 테이블

CREATE TABLE IF NOT EXISTS chamgab_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) NOT NULL,
  user_id UUID,  -- nullable for guest
  chamgab_price BIGINT NOT NULL,
  min_price BIGINT NOT NULL,
  max_price BIGINT NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_chamgab_property ON chamgab_analyses(property_id);
CREATE INDEX IF NOT EXISTS idx_chamgab_user ON chamgab_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_chamgab_expires ON chamgab_analyses(expires_at);

-- RLS 정책
ALTER TABLE chamgab_analyses ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 분석 결과 조회 가능 (rate limit은 API에서 처리)
CREATE POLICY "Anyone can read chamgab analyses" ON chamgab_analyses
  FOR SELECT USING (true);

-- 인증된 사용자만 분석 요청 가능
CREATE POLICY "Authenticated users can insert analyses" ON chamgab_analyses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR user_id IS NULL);

COMMENT ON TABLE chamgab_analyses IS '참값 분석 결과 테이블';
COMMENT ON COLUMN chamgab_analyses.chamgab_price IS 'AI 예측 참값 가격 (원)';
COMMENT ON COLUMN chamgab_analyses.min_price IS '예측 최저가 (원)';
COMMENT ON COLUMN chamgab_analyses.max_price IS '예측 최고가 (원)';
COMMENT ON COLUMN chamgab_analyses.confidence IS '신뢰도 (0.00 ~ 1.00)';
COMMENT ON COLUMN chamgab_analyses.expires_at IS '분석 결과 유효기간 (기본 7일)';
