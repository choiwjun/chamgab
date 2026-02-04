-- ============================================
-- Chamgab 전체 마이그레이션 SQL
-- Supabase SQL Editor에서 실행
-- ============================================

-- =====================
-- Extensions 활성화
-- =====================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================
-- 1. Complexes (단지)
-- =====================
CREATE TABLE IF NOT EXISTS complexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NOT NULL,
  sido VARCHAR(20) NOT NULL,
  sigungu VARCHAR(50) NOT NULL,
  eupmyeondong VARCHAR(50),
  location GEOGRAPHY(POINT, 4326),
  total_units INT,
  total_buildings INT,
  built_year INT,
  parking_ratio DECIMAL(5,2),
  brand VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complexes_location ON complexes USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_complexes_sido_sigungu ON complexes (sido, sigungu);
CREATE INDEX IF NOT EXISTS idx_complexes_name ON complexes USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_complexes_built_year ON complexes (built_year);
CREATE INDEX IF NOT EXISTS idx_complexes_brand ON complexes (brand);
CREATE INDEX IF NOT EXISTS idx_complexes_sido_name ON complexes (sido, name);
CREATE INDEX IF NOT EXISTS idx_complexes_updated_at ON complexes (updated_at DESC);

CREATE OR REPLACE FUNCTION update_complexes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_complexes_updated_at ON complexes;
CREATE TRIGGER trigger_update_complexes_updated_at
  BEFORE UPDATE ON complexes
  FOR EACH ROW
  EXECUTE FUNCTION update_complexes_updated_at();

-- =====================
-- 2. Regions (지역)
-- =====================
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  level INT NOT NULL CHECK (level IN (1, 2, 3)),
  parent_code VARCHAR(10),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  avg_price BIGINT,
  price_change_weekly DECIMAL(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regions_level ON regions (level);
CREATE INDEX IF NOT EXISTS idx_regions_parent ON regions (parent_code);
CREATE INDEX IF NOT EXISTS idx_regions_code ON regions (code);
CREATE INDEX IF NOT EXISTS idx_regions_name ON regions (name);

ALTER TABLE regions DROP CONSTRAINT IF EXISTS fk_regions_parent_code;
ALTER TABLE regions
ADD CONSTRAINT fk_regions_parent_code
FOREIGN KEY (parent_code)
REFERENCES regions (code)
ON DELETE RESTRICT;

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_select_public" ON regions;
CREATE POLICY "regions_select_public" ON regions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "regions_insert_admin" ON regions;
CREATE POLICY "regions_insert_admin" ON regions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

DROP POLICY IF EXISTS "regions_update_admin" ON regions;
CREATE POLICY "regions_update_admin" ON regions
  FOR UPDATE USING (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

-- =====================
-- 3. Properties (매물)
-- =====================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_type VARCHAR(20) NOT NULL CHECK (property_type IN ('apt', 'officetel', 'villa', 'store', 'land', 'building')),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  sido VARCHAR(50),
  sigungu VARCHAR(50),
  eupmyeondong VARCHAR(50),
  location GEOGRAPHY(POINT, 4326),
  area_exclusive DECIMAL(10,2),
  built_year INTEGER,
  floors INTEGER,
  thumbnail TEXT,
  images TEXT[],
  complex_id UUID REFERENCES complexes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_location ON properties USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_properties_sido_sigungu ON properties (sido, sigungu);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties (property_type);
CREATE INDEX IF NOT EXISTS idx_properties_complex_id ON properties (complex_id);
CREATE INDEX IF NOT EXISTS idx_properties_area ON properties (area_exclusive);
CREATE INDEX IF NOT EXISTS idx_properties_built_year ON properties (built_year);
CREATE INDEX IF NOT EXISTS idx_properties_name ON properties USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties USING GIN(address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_sido_type_created ON properties (sido, property_type, created_at DESC);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select_public" ON properties;
CREATE POLICY "properties_select_public" ON properties
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "properties_insert_admin" ON properties;
CREATE POLICY "properties_insert_admin" ON properties
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

DROP POLICY IF EXISTS "properties_update_admin" ON properties;
CREATE POLICY "properties_update_admin" ON properties
  FOR UPDATE USING (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

DROP POLICY IF EXISTS "properties_delete_admin" ON properties;
CREATE POLICY "properties_delete_admin" ON properties
  FOR DELETE USING (auth.role() = 'authenticated' AND auth.jwt()->>'role' = 'admin');

-- =====================
-- 4. Chamgab Analyses
-- =====================
CREATE TABLE IF NOT EXISTS chamgab_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) NOT NULL,
  user_id UUID,
  chamgab_price BIGINT NOT NULL,
  min_price BIGINT NOT NULL,
  max_price BIGINT NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chamgab_property ON chamgab_analyses(property_id);
CREATE INDEX IF NOT EXISTS idx_chamgab_user ON chamgab_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_chamgab_expires ON chamgab_analyses(expires_at);

ALTER TABLE chamgab_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read chamgab analyses" ON chamgab_analyses;
CREATE POLICY "Anyone can read chamgab analyses" ON chamgab_analyses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert analyses" ON chamgab_analyses;
CREATE POLICY "Authenticated users can insert analyses" ON chamgab_analyses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR user_id IS NULL);

-- =====================
-- 5. Price Factors
-- =====================
CREATE TABLE IF NOT EXISTS price_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES chamgab_analyses(id) ON DELETE CASCADE NOT NULL,
  rank INT NOT NULL CHECK (rank >= 1 AND rank <= 20),
  factor_name VARCHAR(100) NOT NULL,
  factor_name_ko VARCHAR(100) NOT NULL,
  contribution BIGINT NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('positive', 'negative')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factors_analysis ON price_factors(analysis_id);
CREATE INDEX IF NOT EXISTS idx_factors_rank ON price_factors(analysis_id, rank);

ALTER TABLE price_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read price factors" ON price_factors;
CREATE POLICY "Anyone can read price factors" ON price_factors
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can insert price factors" ON price_factors;
CREATE POLICY "System can insert price factors" ON price_factors
  FOR INSERT WITH CHECK (true);

-- =====================
-- 6. Transactions
-- =====================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  complex_id UUID REFERENCES complexes(id),
  transaction_date DATE NOT NULL,
  price BIGINT NOT NULL,
  area_exclusive DECIMAL(10,2),
  floor INT,
  dong VARCHAR(50),
  buyer_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_property ON transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_transactions_complex ON transactions(complex_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_price ON transactions(price);
CREATE INDEX IF NOT EXISTS idx_transactions_complex_date ON transactions(complex_id, transaction_date DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read transactions" ON transactions;
CREATE POLICY "Anyone can read transactions" ON transactions
  FOR SELECT USING (true);

-- =====================
-- 7. Favorites
-- =====================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_property ON favorites(property_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created ON favorites(user_id, created_at DESC);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own favorites" ON favorites;
CREATE POLICY "Users can read own favorites" ON favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own favorites" ON favorites;
CREATE POLICY "Users can insert own favorites" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (auth.uid() = user_id);

-- =====================
-- 8. User Profiles
-- =====================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar_url TEXT,
  tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'business')),
  daily_analysis_count INTEGER DEFAULT 0,
  daily_analysis_limit INTEGER DEFAULT 3,
  daily_analysis_reset_at DATE DEFAULT CURRENT_DATE,
  phone VARCHAR(20),
  notification_settings JSONB DEFAULT '{"email": true, "push": true, "chamgab_changed": true, "transaction_new": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier ON user_profiles(tier);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Daily reset function
CREATE OR REPLACE FUNCTION reset_daily_analysis_count()
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET daily_analysis_count = 0, daily_analysis_reset_at = CURRENT_DATE
  WHERE daily_analysis_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- 9. Notifications
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('chamgab_changed', 'transaction_new', 'report_ready', 'system')),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(user_id, type);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
CREATE POLICY "Service can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- =====================
-- 10. Subscriptions
-- =====================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan VARCHAR(30) NOT NULL CHECK (plan IN ('premium_monthly', 'premium_yearly', 'business')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'pending')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  external_subscription_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_external ON subscriptions(external_subscription_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own subscriptions" ON subscriptions;
CREATE POLICY "Users can read own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service can manage subscriptions" ON subscriptions;
CREATE POLICY "Service can manage subscriptions" ON subscriptions
  FOR ALL USING (true);

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Subscription sync function
CREATE OR REPLACE FUNCTION sync_user_tier_on_subscription()
RETURNS TRIGGER AS $$
DECLARE
  new_tier VARCHAR(20);
  new_limit INTEGER;
BEGIN
  IF NEW.status = 'active' THEN
    CASE NEW.plan
      WHEN 'business' THEN
        new_tier := 'business';
        new_limit := 999999;
      WHEN 'premium_monthly', 'premium_yearly' THEN
        new_tier := 'premium';
        new_limit := 30;
      ELSE
        new_tier := 'free';
        new_limit := 3;
    END CASE;
  ELSE
    new_tier := 'free';
    new_limit := 3;
  END IF;

  UPDATE user_profiles
  SET tier = new_tier, daily_analysis_limit = new_limit
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_user_tier_trigger ON subscriptions;
CREATE TRIGGER sync_user_tier_trigger
  AFTER INSERT OR UPDATE OF status ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_user_tier_on_subscription();

-- =====================
-- 11. Payments
-- =====================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'KRW',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'canceled')),
  payment_method VARCHAR(50),
  external_payment_id VARCHAR(100),
  description VARCHAR(200),
  metadata JSONB DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_external ON payments(external_payment_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payments" ON payments;
CREATE POLICY "Users can read own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service can manage payments" ON payments;
CREATE POLICY "Service can manage payments" ON payments
  FOR ALL USING (true);

-- =====================
-- SEED DATA
-- =====================

-- Level 1: 시도
INSERT INTO regions (code, name, level, latitude, longitude, created_at, updated_at)
VALUES ('1100000000', '서울시', 1, 37.5665, 126.9780, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Level 2: 시군구
INSERT INTO regions (code, name, level, parent_code, latitude, longitude, avg_price, price_change_weekly, created_at, updated_at)
VALUES
  ('1111000000', '강남구', 2, '1100000000', 37.4979, 127.0276, 3500000000, 0.5, NOW(), NOW()),
  ('1111500000', '서초구', 2, '1100000000', 37.4830, 127.0330, 4200000000, -0.2, NOW(), NOW()),
  ('1111700000', '송파구', 2, '1100000000', 37.5095, 127.1064, 3200000000, 0.3, NOW(), NOW()),
  ('1104000000', '마포구', 2, '1100000000', 37.5636, 126.9024, 2800000000, 0.1, NOW(), NOW()),
  ('1106000000', '영등포구', 2, '1100000000', 37.5250, 126.8905, 2600000000, -0.4, NOW(), NOW()),
  ('1107000000', '구로구', 2, '1100000000', 37.4954, 126.8530, 2400000000, 0.2, NOW(), NOW()),
  ('1108000000', '금천구', 2, '1100000000', 37.4654, 126.8994, 2300000000, -0.1, NOW(), NOW()),
  ('1109000000', '동작구', 2, '1100000000', 37.4893, 126.9397, 2700000000, 0.4, NOW(), NOW()),
  ('1110000000', '관악구', 2, '1100000000', 37.4627, 126.9529, 2200000000, 0.0, NOW(), NOW()),
  ('1113000000', '강동구', 2, '1100000000', 37.5308, 127.1219, 2900000000, 0.3, NOW(), NOW()),
  ('1101000000', '강서구', 2, '1100000000', 37.5509, 126.8495, 2500000000, 0.2, NOW(), NOW()),
  ('1102000000', '종로구', 2, '1100000000', 37.5735, 126.9788, 3000000000, 0.1, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Level 3: 읍면동
INSERT INTO regions (code, name, level, parent_code, latitude, longitude, created_at, updated_at)
VALUES
  ('1111010100', '역삼1동', 3, '1111000000', 37.4980, 127.0270, NOW(), NOW()),
  ('1111010200', '역삼2동', 3, '1111000000', 37.5050, 127.0300, NOW(), NOW()),
  ('1111020000', '강남동', 3, '1111000000', 37.4850, 127.0120, NOW(), NOW()),
  ('1111030000', '삼성1동', 3, '1111000000', 37.4950, 127.0450, NOW(), NOW()),
  ('1111040000', '삼성2동', 3, '1111000000', 37.5080, 127.0550, NOW(), NOW()),
  ('1111070000', '압구정동', 3, '1111000000', 37.5280, 127.0190, NOW(), NOW()),
  ('1111510000', '방배동', 3, '1111500000', 37.4720, 127.0170, NOW(), NOW()),
  ('1111520000', '반포1동', 3, '1111500000', 37.4968, 127.0078, NOW(), NOW()),
  ('1111530000', '반포2동', 3, '1111500000', 37.5022, 127.0100, NOW(), NOW()),
  ('1111700100', '잠실동', 3, '1111700000', 37.5145, 127.0850, NOW(), NOW()),
  ('1101010000', '마곡동', 3, '1101000000', 37.5680, 126.8420, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Complexes
INSERT INTO complexes (
  id, name, address, sido, sigungu, eupmyeondong,
  location, total_units, total_buildings, built_year, parking_ratio, brand,
  created_at, updated_at
) VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::uuid, '래미안 강남', '서울시 강남구 역삼동 123', '서울시', '강남구', '역삼동', ST_GeographyFromText('POINT(127.0276 37.4979)'), 800, 16, 2015, 1.2, '래미안', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440002'::uuid, '자이 강남', '서울시 강남구 신사동 456', '서울시', '강남구', '신사동', ST_GeographyFromText('POINT(127.0143 37.5150)'), 600, 12, 2018, 1.0, '자이', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440003'::uuid, '반포 래미안 푸르지오', '서울시 서초구 반포동 789', '서울시', '서초구', '반포동', ST_GeographyFromText('POINT(127.0073 37.4823)'), 1200, 20, 2012, 1.5, '래미안', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440004'::uuid, '자이 서초', '서울시 서초구 서초동 321', '서울시', '서초구', '서초동', ST_GeographyFromText('POINT(127.0232 37.4945)'), 450, 9, 2020, 0.9, '자이', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440005'::uuid, '경복궁 래미안', '서울시 종로구 청와대로 654', '서울시', '종로구', '평창동', ST_GeographyFromText('POINT(126.9837 37.5917)'), 500, 10, 2008, 1.1, '래미안', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440006'::uuid, '롯데캐슬 잠실', '서울시 송파구 잠실동 111', '서울시', '송파구', '잠실동', ST_GeographyFromText('POINT(127.0850 37.5145)'), 1500, 25, 2010, 1.3, '롯데', NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440007'::uuid, '마곡 푸르지오', '서울시 강서구 마곡동 222', '서울시', '강서구', '마곡동', ST_GeographyFromText('POINT(126.8420 37.5680)'), 2000, 30, 2017, 1.4, '현대', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Properties
INSERT INTO properties (
  id, property_type, name, address, sido, sigungu, eupmyeondong,
  location, area_exclusive, built_year, floors, thumbnail, complex_id, created_at
) VALUES
  ('650e8400-e29b-41d4-a716-446655440001'::uuid, 'apt', '래미안 강남 101동 1001호', '서울시 강남구 역삼동 123-1', '서울시', '강남구', '역삼동', ST_GeographyFromText('POINT(127.0276 37.4979)'), 84.50, 2015, 10, 'https://picsum.photos/seed/apt1/400/300', '550e8400-e29b-41d4-a716-446655440001'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440002'::uuid, 'apt', '래미안 강남 102동 1502호', '서울시 강남구 역삼동 123-2', '서울시', '강남구', '역삼동', ST_GeographyFromText('POINT(127.0280 37.4982)'), 112.30, 2015, 15, 'https://picsum.photos/seed/apt2/400/300', '550e8400-e29b-41d4-a716-446655440001'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440003'::uuid, 'officetel', '강남 센터빌 502호', '서울시 강남구 테헤란로 456', '서울시', '강남구', '역삼동', ST_GeographyFromText('POINT(127.0300 37.5000)'), 45.20, 2018, 5, 'https://picsum.photos/seed/off1/400/300', NULL, NOW()),
  ('650e8400-e29b-41d4-a716-446655440004'::uuid, 'apt', '반포 래미안 푸르지오 301동 2001호', '서울시 서초구 반포동 789-1', '서울시', '서초구', '반포동', ST_GeographyFromText('POINT(127.0073 37.4823)'), 135.80, 2012, 20, 'https://picsum.photos/seed/apt3/400/300', '550e8400-e29b-41d4-a716-446655440003'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440005'::uuid, 'villa', '서초빌라 A동 301호', '서울시 서초구 반포동 789-5', '서울시', '서초구', '반포동', ST_GeographyFromText('POINT(127.0080 37.4830)'), 65.00, 2010, 3, 'https://picsum.photos/seed/villa1/400/300', NULL, NOW()),
  ('650e8400-e29b-41d4-a716-446655440006'::uuid, 'apt', '롯데캐슬 잠실 1501호', '서울시 송파구 잠실동 111-1', '서울시', '송파구', '잠실동', ST_GeographyFromText('POINT(127.0850 37.5145)'), 98.50, 2010, 15, 'https://picsum.photos/seed/apt4/400/300', '550e8400-e29b-41d4-a716-446655440006'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440007'::uuid, 'apt', '마곡 푸르지오 2301호', '서울시 강서구 마곡동 222-1', '서울시', '강서구', '마곡동', ST_GeographyFromText('POINT(126.8420 37.5680)'), 76.30, 2017, 23, 'https://picsum.photos/seed/apt5/400/300', '550e8400-e29b-41d4-a716-446655440007'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440008'::uuid, 'apt', '자이 강남 201동 801호', '서울시 강남구 신사동 456-1', '서울시', '강남구', '신사동', ST_GeographyFromText('POINT(127.0143 37.5150)'), 92.40, 2018, 8, 'https://picsum.photos/seed/apt6/400/300', '550e8400-e29b-41d4-a716-446655440002'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440009'::uuid, 'apt', '자이 서초 1201호', '서울시 서초구 서초동 321-1', '서울시', '서초구', '서초동', ST_GeographyFromText('POINT(127.0232 37.4945)'), 105.60, 2020, 12, 'https://picsum.photos/seed/apt7/400/300', '550e8400-e29b-41d4-a716-446655440004'::uuid, NOW()),
  ('650e8400-e29b-41d4-a716-446655440010'::uuid, 'apt', '경복궁 래미안 501호', '서울시 종로구 평창동 654-1', '서울시', '종로구', '평창동', ST_GeographyFromText('POINT(126.9837 37.5917)'), 88.20, 2008, 5, 'https://picsum.photos/seed/apt8/400/300', '550e8400-e29b-41d4-a716-446655440005'::uuid, NOW())
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 완료!
-- =====================
