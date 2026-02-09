CREATE TABLE land_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pnu VARCHAR(19) UNIQUE NOT NULL,  -- 필지고유번호 19자리
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  jibun VARCHAR(20),
  land_category VARCHAR(10) NOT NULL,  -- 지목: 대, 전, 답, 임, 잡 등
  zoning VARCHAR(50),  -- 용도지역
  area_m2 NUMERIC(12,2),
  location GEOGRAPHY(POINT, 4326),
  latest_official_price_per_m2 NUMERIC(12,0),
  latest_official_price_year INT,
  latest_transaction_price NUMERIC(15,0),  -- 만원
  latest_transaction_date DATE,
  latest_price_per_m2 NUMERIC(12,0),  -- 원/m²
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_land_parcels_location ON land_parcels USING GIST (location);
CREATE INDEX idx_land_parcels_sigungu ON land_parcels (sigungu);
CREATE INDEX idx_land_parcels_category ON land_parcels (land_category);
CREATE INDEX idx_land_parcels_pnu ON land_parcels (pnu);

ALTER TABLE land_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read land_parcels" ON land_parcels FOR SELECT USING (true);
