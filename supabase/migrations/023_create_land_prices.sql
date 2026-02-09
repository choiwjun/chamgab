CREATE TABLE land_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES land_parcels(id),
  price_year INT NOT NULL,
  official_price_per_m2 NUMERIC(12,0) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parcel_id, price_year)
);

CREATE INDEX idx_land_prices_parcel ON land_prices (parcel_id);
CREATE INDEX idx_land_prices_year ON land_prices (price_year DESC);

ALTER TABLE land_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read land_prices" ON land_prices FOR SELECT USING (true);
