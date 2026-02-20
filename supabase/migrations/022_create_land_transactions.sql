CREATE TABLE land_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID REFERENCES land_parcels(id),
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  jibun VARCHAR(20),
  land_category VARCHAR(10),
  area_m2 NUMERIC(12,2) NOT NULL,
  price NUMERIC(15,0) NOT NULL,  -- 만원
  price_per_m2 NUMERIC(12,0),  -- 원/m² (계산값)
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(20),
  is_partial_sale BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_land_txn_sigungu ON land_transactions (sigungu);
CREATE INDEX idx_land_txn_date ON land_transactions (transaction_date DESC);
CREATE INDEX idx_land_txn_category ON land_transactions (land_category);
CREATE INDEX idx_land_txn_parcel ON land_transactions (parcel_id);

ALTER TABLE land_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read land_transactions" ON land_transactions FOR SELECT USING (true);
