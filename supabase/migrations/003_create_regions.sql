-- @TASK P2-R2-T1 - Regions 테이블 생성
-- @SPEC docs/planning/04-database-design.md#regions-table
-- @SPEC specs/domain/resources.yaml#regions

-- 지역 정보 테이블 (계층형)
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,              -- 법정동코드 (10자리)
  name VARCHAR(50) NOT NULL,                     -- 지역명
  level INT NOT NULL CHECK (level IN (1, 2, 3)), -- 1: 시도, 2: 시군구, 3: 읍면동
  parent_code VARCHAR(10),                       -- 상위 지역 코드
  latitude DECIMAL(10, 7),                       -- 위도
  longitude DECIMAL(10, 7),                      -- 경도
  avg_price BIGINT,                              -- 평균가격 캐시 (원)
  price_change_weekly DECIMAL(5, 2),             -- 주간 변동률 캐시 (%)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_regions_level ON regions (level);
CREATE INDEX idx_regions_parent ON regions (parent_code);
CREATE INDEX idx_regions_code ON regions (code);
CREATE INDEX idx_regions_name ON regions (name);

-- 외래키 제약조건 (자체 참조)
ALTER TABLE regions
ADD CONSTRAINT fk_regions_parent_code
FOREIGN KEY (parent_code)
REFERENCES regions (code)
ON DELETE RESTRICT;

-- RLS 정책 (공개 읽기)
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regions_select_public" ON regions
  FOR SELECT
  USING (true);

CREATE POLICY "regions_insert_admin" ON regions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

CREATE POLICY "regions_update_admin" ON regions
  FOR UPDATE
  USING (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');
