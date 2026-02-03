-- @TASK P2-R0-T1 - Complexes 테이블 생성
-- @SPEC docs/planning/04-database-design.md#complexes-table
-- @SPEC specs/domain/resources.yaml#complexes
--
-- 아파트 단지 정보 테이블
-- PostGIS 확장 활성화 필요: CREATE EXTENSION IF NOT EXISTS postgis

-- PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;

-- 텍스트 검색을 위한 pg_trgm 확장 활성화 (LIKE 및 정규표현식 최적화)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 아파트 단지 정보 테이블
CREATE TABLE IF NOT EXISTS complexes (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,           -- 단지명
  address VARCHAR(500) NOT NULL,        -- 주소
  sido VARCHAR(20) NOT NULL,            -- 시도 (서울시, 경기도 등)
  sigungu VARCHAR(50) NOT NULL,         -- 시군구 (강남구, 서초구 등)
  eupmyeondong VARCHAR(50),             -- 읍면동

  -- 공간 정보
  location GEOGRAPHY(POINT, 4326),      -- 위치 좌표 (PostGIS GEOGRAPHY 타입)

  -- 단지 정보
  total_units INT,                      -- 총 세대수
  total_buildings INT,                  -- 총 동수
  built_year INT,                       -- 준공년도
  parking_ratio DECIMAL(5,2),           -- 주차대수비율

  -- 분류 정보
  brand VARCHAR(50),                    -- 브랜드명 (래미안, 자이 등)

  -- 감사 정보
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 공간 인덱스 (PostGIS - 반경 검색 최적화)
-- GIST 인덱스는 공간 검색에 최적화됨
CREATE INDEX IF NOT EXISTS idx_complexes_location
  ON complexes USING GIST (location);

-- 지역 검색 인덱스 (sido, sigungu 조합)
-- 검색 필터링 최적화
CREATE INDEX IF NOT EXISTS idx_complexes_sido_sigungu
  ON complexes (sido, sigungu);

-- 단지명 전문검색 인덱스 (pg_trgm - 유사도 검색)
-- LIKE 및 와일드카드 검색 최적화
CREATE INDEX IF NOT EXISTS idx_complexes_name
  ON complexes USING GIN(name gin_trgm_ops);

-- 준공년도 인덱스 (필터링)
CREATE INDEX IF NOT EXISTS idx_complexes_built_year
  ON complexes (built_year);

-- 브랜드 인덱스 (필터링)
CREATE INDEX IF NOT EXISTS idx_complexes_brand
  ON complexes (brand);

-- 복합 인덱스 (시도별 검색 + 정렬)
CREATE INDEX IF NOT EXISTS idx_complexes_sido_name
  ON complexes (sido, name);

-- updated_at 인덱스 (변경 감지용)
CREATE INDEX IF NOT EXISTS idx_complexes_updated_at
  ON complexes (updated_at DESC);

-- 함수: updated_at 자동 업데이트
-- updated_at 컬럼을 UPDATE 시 자동으로 현재시간으로 설정
CREATE OR REPLACE FUNCTION update_complexes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거: updated_at 자동 업데이트
DROP TRIGGER IF EXISTS trigger_update_complexes_updated_at ON complexes;
CREATE TRIGGER trigger_update_complexes_updated_at
  BEFORE UPDATE ON complexes
  FOR EACH ROW
  EXECUTE FUNCTION update_complexes_updated_at();

-- Row Level Security 활성화 (선택사항 - 마이그레이션 이후 필요 시 활성화)
-- ALTER TABLE complexes ENABLE ROW LEVEL SECURITY;
--
-- -- 모든 사용자에게 조회 권한 부여
-- CREATE POLICY complexes_select_policy ON complexes
--   FOR SELECT
--   USING (true);
