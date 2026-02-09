CREATE TABLE land_characteristics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id UUID NOT NULL REFERENCES land_parcels(id) UNIQUE,
  land_use VARCHAR(50),
  elevation_type VARCHAR(20),
  terrain_shape VARCHAR(20),
  road_access VARCHAR(50),
  road_distance VARCHAR(20),
  zoning_detail VARCHAR(100),
  building_coverage NUMERIC(5,2),
  floor_area_ratio NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE land_characteristics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read land_characteristics" ON land_characteristics FOR SELECT USING (true);
