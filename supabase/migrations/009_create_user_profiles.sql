-- P4-R1: User Profiles 테이블 생성
-- Supabase auth.users 확장 프로필

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

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier ON user_profiles(tier);

-- RLS 정책
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필만 조회 가능
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- 본인 프로필만 수정 가능
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- 본인 프로필만 생성 가능 (회원가입 시)
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 사용자 생성 시 자동으로 프로필 생성 트리거
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

-- 기존 트리거가 있으면 삭제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 새 트리거 생성
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 일일 분석 카운트 리셋 함수
CREATE OR REPLACE FUNCTION reset_daily_analysis_count()
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET daily_analysis_count = 0, daily_analysis_reset_at = CURRENT_DATE
  WHERE daily_analysis_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_profiles IS '사용자 프로필 (auth.users 확장)';
COMMENT ON COLUMN user_profiles.id IS 'auth.users.id와 동일';
COMMENT ON COLUMN user_profiles.tier IS '구독 등급 (free, premium, business)';
COMMENT ON COLUMN user_profiles.daily_analysis_count IS '오늘 사용한 분석 횟수';
COMMENT ON COLUMN user_profiles.daily_analysis_limit IS '일일 분석 한도 (free:3, premium:30, business:무제한)';
