-- P4-Commercial: 상권분석 테이블 생성
-- 소상공인진흥공단 API 데이터 저장

-- 1. 개폐업 통계 테이블
CREATE TABLE IF NOT EXISTS business_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드
  industry_large_code VARCHAR(10), -- 업종대분류코드
  industry_medium_code VARCHAR(10), -- 업종중분류코드
  industry_small_code VARCHAR(10), -- 업종소분류코드
  industry_name VARCHAR(100), -- 업종명
  open_count INT DEFAULT 0, -- 개업건수
  close_count INT DEFAULT 0, -- 폐업건수
  operating_count INT DEFAULT 0, -- 영업중건수
  survival_rate DECIMAL(5,2), -- 생존율 (%)
  base_year_month VARCHAR(6) NOT NULL, -- 기준년월 (YYYYMM)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, industry_small_code, base_year_month)
);

-- 2. 매출 통계 테이블
CREATE TABLE IF NOT EXISTS sales_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드
  industry_large_code VARCHAR(10), -- 업종대분류코드
  industry_medium_code VARCHAR(10), -- 업종중분류코드
  industry_small_code VARCHAR(10), -- 업종소분류코드
  industry_name VARCHAR(100), -- 업종명
  monthly_avg_sales BIGINT, -- 월평균매출금액 (원)
  monthly_sales_count INT, -- 월평균매출건수
  sales_growth_rate DECIMAL(10,2), -- 매출증가율 (%)
  weekend_sales_ratio DECIMAL(5,2), -- 주말매출비율 (%)
  weekday_sales_ratio DECIMAL(5,2), -- 주중매출비율 (%)
  base_year_month VARCHAR(6) NOT NULL, -- 기준년월 (YYYYMM)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, industry_small_code, base_year_month)
);

-- 3. 점포수 통계 테이블
CREATE TABLE IF NOT EXISTS store_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_district_code VARCHAR(10) NOT NULL, -- 상권코드
  sido_code VARCHAR(5), -- 시도코드
  sigungu_code VARCHAR(5), -- 시군구코드
  industry_large_code VARCHAR(10), -- 업종대분류코드
  industry_medium_code VARCHAR(10), -- 업종중분류코드
  industry_small_code VARCHAR(10), -- 업종소분류코드
  industry_name VARCHAR(100), -- 업종명
  store_count INT DEFAULT 0, -- 점포수
  density_level VARCHAR(10), -- 밀집도 (높음/중간/낮음)
  franchise_count INT DEFAULT 0, -- 프랜차이즈 점포수
  independent_count INT DEFAULT 0, -- 독립 점포수
  base_year_month VARCHAR(6) NOT NULL, -- 기준년월 (YYYYMM)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(commercial_district_code, industry_small_code, base_year_month)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_business_stats_district ON business_statistics(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_business_stats_industry ON business_statistics(industry_small_code);
CREATE INDEX IF NOT EXISTS idx_business_stats_date ON business_statistics(base_year_month DESC);
CREATE INDEX IF NOT EXISTS idx_business_stats_survival ON business_statistics(survival_rate DESC);

CREATE INDEX IF NOT EXISTS idx_sales_stats_district ON sales_statistics(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_sales_stats_industry ON sales_statistics(industry_small_code);
CREATE INDEX IF NOT EXISTS idx_sales_stats_date ON sales_statistics(base_year_month DESC);
CREATE INDEX IF NOT EXISTS idx_sales_stats_amount ON sales_statistics(monthly_avg_sales DESC);

CREATE INDEX IF NOT EXISTS idx_store_stats_district ON store_statistics(commercial_district_code);
CREATE INDEX IF NOT EXISTS idx_store_stats_industry ON store_statistics(industry_small_code);
CREATE INDEX IF NOT EXISTS idx_store_stats_date ON store_statistics(base_year_month DESC);
CREATE INDEX IF NOT EXISTS idx_store_stats_count ON store_statistics(store_count DESC);

-- RLS 정책
ALTER TABLE business_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read business_statistics" ON business_statistics
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read sales_statistics" ON sales_statistics
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read store_statistics" ON store_statistics
  FOR SELECT USING (true);

-- 테이블 설명
COMMENT ON TABLE business_statistics IS '상권별 업종별 개폐업 통계 데이터';
COMMENT ON TABLE sales_statistics IS '상권별 업종별 매출 통계 데이터';
COMMENT ON TABLE store_statistics IS '상권별 업종별 점포수 통계 데이터';

COMMENT ON COLUMN business_statistics.survival_rate IS '생존율 = (영업중 / (영업중 + 폐업)) * 100';
COMMENT ON COLUMN sales_statistics.monthly_avg_sales IS '월평균 매출금액 (원)';
COMMENT ON COLUMN store_statistics.density_level IS '점포 밀집도: 높음(50개 이상), 중간(10-49개), 낮음(10개 미만)';
