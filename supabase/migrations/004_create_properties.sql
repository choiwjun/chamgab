-- @TASK P2-R1-T1 - Properties 테이블 생성
-- @SPEC docs/planning/04-database-design.md#properties-table
-- @SPEC specs/domain/resources.yaml#properties
--
-- 부동산 매물 정보 테이블
-- PostGIS 확장 활성화 필요: CREATE EXTENSION IF NOT EXISTS postgis

-- 매물 정보 테이블
CREATE TABLE IF NOT EXISTS properties (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_type VARCHAR(20) NOT NULL CHECK (property_type IN ('apt', 'officetel', 'villa', 'store', 'land', 'building')),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,

  -- 지역 정보
  sido VARCHAR(50),
  sigungu VARCHAR(50),
  eupmyeondong VARCHAR(50),

  -- 공간 정보 (PostGIS)
  location GEOGRAPHY(POINT, 4326),

  -- 매물 상세 정보
  area_exclusive DECIMAL(10,2),
  built_year INTEGER,
  floors INTEGER,

  -- 이미지
  thumbnail TEXT,
  images TEXT[],

  -- 단지 참조 (외래키)
  complex_id UUID REFERENCES complexes(id) ON DELETE SET NULL,

  -- 감사 정보
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 공간 인덱스 (PostGIS - 위치 기반 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_properties_location
  ON properties USING GIST (location);

-- 지역 검색 인덱스 (sido, sigungu 조합)
CREATE INDEX IF NOT EXISTS idx_properties_sido_sigungu
  ON properties (sido, sigungu);

-- 매물 유형 인덱스
CREATE INDEX IF NOT EXISTS idx_properties_type
  ON properties (property_type);

-- 단지 참조 인덱스
CREATE INDEX IF NOT EXISTS idx_properties_complex_id
  ON properties (complex_id);

-- 면적 범위 검색 인덱스
CREATE INDEX IF NOT EXISTS idx_properties_area
  ON properties (area_exclusive);

-- 건축년도 인덱스
CREATE INDEX IF NOT EXISTS idx_properties_built_year
  ON properties (built_year);

-- 매물명 전문검색 인덱스 (pg_trgm - 유사도 검색)
CREATE INDEX IF NOT EXISTS idx_properties_name
  ON properties USING GIN(name gin_trgm_ops);

-- 주소 전문검색 인덱스
CREATE INDEX IF NOT EXISTS idx_properties_address
  ON properties USING GIN(address gin_trgm_ops);

-- 생성일 인덱스 (정렬용)
CREATE INDEX IF NOT EXISTS idx_properties_created_at
  ON properties (created_at DESC);

-- 복합 인덱스 (시도별 유형별 검색 + 정렬)
CREATE INDEX IF NOT EXISTS idx_properties_sido_type_created
  ON properties (sido, property_type, created_at DESC);

-- Row Level Security 활성화
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- 모든 사용자에게 조회 권한 부여
CREATE POLICY "properties_select_public" ON properties
  FOR SELECT
  USING (true);

-- 인증된 관리자만 삽입/수정/삭제 가능
CREATE POLICY "properties_insert_admin" ON properties
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

CREATE POLICY "properties_update_admin" ON properties
  FOR UPDATE
  USING (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

CREATE POLICY "properties_delete_admin" ON properties
  FOR DELETE
  USING (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

-- 코멘트 추가
COMMENT ON TABLE properties IS '부동산 매물 정보';
COMMENT ON COLUMN properties.property_type IS '매물 유형: apt(아파트), officetel(오피스텔), villa(빌라), store(상가), land(토지), building(건물)';
COMMENT ON COLUMN properties.location IS 'PostGIS GEOGRAPHY(POINT, 4326) - 위치 좌표';
COMMENT ON COLUMN properties.area_exclusive IS '전용면적 (제곱미터)';
COMMENT ON COLUMN properties.complex_id IS '소속 단지 ID (complexes 테이블 참조)';
