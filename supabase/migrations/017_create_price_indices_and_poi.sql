-- 017: price_indices + poi_data 테이블 생성
-- REB 가격지수 및 Kakao POI 데이터 저장

-- price_indices: 한국부동산원 가격지수
CREATE TABLE IF NOT EXISTS price_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "REGION_CD" VARCHAR(10) NOT NULL,
  "REGION_NM" VARCHAR(50),
  "DEAL_YM" VARCHAR(6) NOT NULL,
  "INDEX_TYPE" VARCHAR(20) NOT NULL,
  "INDEX_VALUE" DECIMAL(10,2),
  "MOM_CHANGE" DECIMAL(10,2),
  "YOY_CHANGE" DECIMAL(10,2),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("REGION_CD", "DEAL_YM", "INDEX_TYPE")
);

ALTER TABLE price_indices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read price_indices" ON price_indices FOR SELECT USING (true);
CREATE POLICY "Service can insert price_indices" ON price_indices FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update price_indices" ON price_indices FOR UPDATE USING (true);

-- poi_data: Kakao POI 데이터 (지역별 편의시설 수)
CREATE TABLE IF NOT EXISTS poi_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region VARCHAR(50) NOT NULL UNIQUE,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  subway_count INT DEFAULT 0,
  bus_count INT DEFAULT 0,
  mart_count INT DEFAULT 0,
  park_count INT DEFAULT 0,
  school_count INT DEFAULT 0,
  hospital_count INT DEFAULT 0,
  bank_count INT DEFAULT 0,
  restaurant_count INT DEFAULT 0,
  cafe_count INT DEFAULT 0,
  gym_count INT DEFAULT 0,
  poi_score DECIMAL(5,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE poi_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read poi_data" ON poi_data FOR SELECT USING (true);
CREATE POLICY "Service can insert poi_data" ON poi_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update poi_data" ON poi_data FOR UPDATE USING (true);
