-- P5-Commercial-Extended: 상권 인구통계 및 특성 테이블
-- 유동인구, 주거인구, 직장인구, 소득소비 데이터

-- 1. 유동인구 통계 (연령대별, 시간대별)
CREATE TABLE IF NOT EXISTS foot_traffic_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드

  -- 연령대별 유동인구 (일평균)
  age_10s INT DEFAULT 0, -- 10대
  age_20s INT DEFAULT 0, -- 20대
  age_30s INT DEFAULT 0, -- 30대
  age_40s INT DEFAULT 0, -- 40대
  age_50s INT DEFAULT 0, -- 50대
  age_60s_plus INT DEFAULT 0, -- 60대 이상

  -- 성별 유동인구
  male_count INT DEFAULT 0, -- 남성
  female_count INT DEFAULT 0, -- 여성

  -- 시간대별 유동인구 (일평균)
  time_00_06 INT DEFAULT 0, -- 00-06시
  time_06_11 INT DEFAULT 0, -- 06-11시
  time_11_14 INT DEFAULT 0, -- 11-14시
  time_14_17 INT DEFAULT 0, -- 14-17시
  time_17_21 INT DEFAULT 0, -- 17-21시
  time_21_24 INT DEFAULT 0, -- 21-24시

  -- 요일별 유동인구
  weekday_avg INT DEFAULT 0, -- 주중 평균
  weekend_avg INT DEFAULT 0, -- 주말 평균

  total_foot_traffic INT DEFAULT 0, -- 총 유동인구
  base_year_quarter VARCHAR(6) NOT NULL, -- 기준년분기 (YYYYQQ)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, base_year_quarter)
);

-- 2. 주거인구 통계 (연령대별)
CREATE TABLE IF NOT EXISTS residential_population (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드

  -- 연령대별 주거인구
  age_10s INT DEFAULT 0,
  age_20s INT DEFAULT 0,
  age_30s INT DEFAULT 0,
  age_40s INT DEFAULT 0,
  age_50s INT DEFAULT 0,
  age_60s_plus INT DEFAULT 0,

  -- 성별 주거인구
  male_count INT DEFAULT 0,
  female_count INT DEFAULT 0,

  total_population INT DEFAULT 0, -- 총 주거인구
  base_year_quarter VARCHAR(6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, base_year_quarter)
);

-- 3. 직장인구 통계
CREATE TABLE IF NOT EXISTS work_population (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드

  -- 연령대별 직장인구
  age_10s INT DEFAULT 0,
  age_20s INT DEFAULT 0,
  age_30s INT DEFAULT 0,
  age_40s INT DEFAULT 0,
  age_50s INT DEFAULT 0,
  age_60s_plus INT DEFAULT 0,

  -- 성별 직장인구
  male_count INT DEFAULT 0,
  female_count INT DEFAULT 0,

  total_workers INT DEFAULT 0, -- 총 직장인구
  base_year_quarter VARCHAR(6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, base_year_quarter)
);

-- 4. 소득소비 통계
CREATE TABLE IF NOT EXISTS income_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드

  monthly_avg_income BIGINT, -- 월평균 소득 (원)
  monthly_avg_consumption BIGINT, -- 월평균 소비 (원)
  consumption_ratio DECIMAL(5,2), -- 소비성향 (%)

  base_year_quarter VARCHAR(6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, base_year_quarter)
);

-- 5. 상권 특성 분석 (계산된 필드)
CREATE TABLE IF NOT EXISTS district_characteristics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  district_name VARCHAR(100), -- 상권명

  -- 상권 유형
  district_type VARCHAR(20), -- 대학상권, 오피스상권, 주거상권, 유흥상권 등

  -- 타겟 연령대
  primary_age_group VARCHAR(10), -- 주 연령대 (20대, 30-40대 등)
  primary_age_ratio DECIMAL(5,2), -- 주 연령대 비율 (%)

  -- 인구 특성
  office_worker_ratio DECIMAL(5,2), -- 직장인구 비율 (%)
  resident_ratio DECIMAL(5,2), -- 주거인구 비율 (%)
  student_ratio DECIMAL(5,2), -- 학생 비율 (%)

  -- 시간대 특성
  peak_time_start VARCHAR(5), -- 피크 시작 시간 (HH:MM)
  peak_time_end VARCHAR(5), -- 피크 종료 시간 (HH:MM)
  peak_time_traffic INT, -- 피크 시간대 유동인구

  -- 요일 특성
  weekday_dominant BOOLEAN, -- 주중 우세 여부
  weekend_sales_ratio DECIMAL(5,2), -- 주말 매출 비율 (%)

  -- 소비 특성
  avg_ticket_price INT, -- 평균 객단가 (원)
  consumption_level VARCHAR(10), -- 소비 수준 (높음/중간/낮음)

  base_year_quarter VARCHAR(6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, base_year_quarter)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_foot_traffic_district ON foot_traffic_statistics(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_foot_traffic_date ON foot_traffic_statistics(base_year_quarter DESC);
CREATE INDEX IF NOT EXISTS idx_foot_traffic_total ON foot_traffic_statistics(total_foot_traffic DESC);

CREATE INDEX IF NOT EXISTS idx_residential_district ON residential_population(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_residential_date ON residential_population(base_year_quarter DESC);

CREATE INDEX IF NOT EXISTS idx_work_district ON work_population(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_work_date ON work_population(base_year_quarter DESC);

CREATE INDEX IF NOT EXISTS idx_income_district ON income_consumption(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_income_date ON income_consumption(base_year_quarter DESC);

CREATE INDEX IF NOT EXISTS idx_characteristics_district ON district_characteristics(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_characteristics_type ON district_characteristics(district_type);
CREATE INDEX IF NOT EXISTS idx_characteristics_age ON district_characteristics(primary_age_group);

-- RLS 정책
ALTER TABLE foot_traffic_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE residential_population ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_population ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE district_characteristics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read foot_traffic_statistics" ON foot_traffic_statistics
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read residential_population" ON residential_population
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read work_population" ON work_population
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read income_consumption" ON income_consumption
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read district_characteristics" ON district_characteristics
  FOR SELECT USING (true);

-- 테이블 설명
COMMENT ON TABLE foot_traffic_statistics IS '상권별 유동인구 통계 (연령대별, 시간대별)';
COMMENT ON TABLE residential_population IS '상권별 주거인구 통계 (연령대별)';
COMMENT ON TABLE work_population IS '상권별 직장인구 통계 (연령대별)';
COMMENT ON TABLE income_consumption IS '상권별 소득소비 통계';
COMMENT ON TABLE district_characteristics IS '상권 특성 분석 (상권 유형, 타겟 연령대, 피크 타임 등)';

-- 컬럼 설명
COMMENT ON COLUMN foot_traffic_statistics.time_00_06 IS '0-6시 시간대 유동인구 (새벽)';
COMMENT ON COLUMN foot_traffic_statistics.time_06_11 IS '6-11시 시간대 유동인구 (오전)';
COMMENT ON COLUMN foot_traffic_statistics.time_11_14 IS '11-14시 시간대 유동인구 (점심)';
COMMENT ON COLUMN foot_traffic_statistics.time_14_17 IS '14-17시 시간대 유동인구 (오후)';
COMMENT ON COLUMN foot_traffic_statistics.time_17_21 IS '17-21시 시간대 유동인구 (저녁)';
COMMENT ON COLUMN foot_traffic_statistics.time_21_24 IS '21-24시 시간대 유동인구 (야간)';

COMMENT ON COLUMN district_characteristics.district_type IS '상권 유형: 대학상권, 오피스상권, 주거상권, 유흥상권, 관광상권 등';
COMMENT ON COLUMN district_characteristics.avg_ticket_price IS '평균 객단가 = 월평균매출 / 월평균매출건수';
COMMENT ON COLUMN district_characteristics.consumption_level IS '소비 수준: 높음(객단가 30,000원 이상), 중간(15,000-30,000원), 낮음(15,000원 미만)';
