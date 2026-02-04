-- P3-R4: Favorites 테이블 생성
-- 관심 매물 저장

CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, property_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_property ON favorites(property_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created ON favorites(user_id, created_at DESC);

-- RLS 정책
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- 본인의 관심 매물만 조회 가능
CREATE POLICY "Users can read own favorites" ON favorites
  FOR SELECT USING (auth.uid() = user_id);

-- 본인의 관심 매물만 추가 가능
CREATE POLICY "Users can insert own favorites" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 본인의 관심 매물만 삭제 가능
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE favorites IS '사용자 관심 매물';
COMMENT ON COLUMN favorites.user_id IS '사용자 UUID (auth.users.id)';
COMMENT ON COLUMN favorites.property_id IS '관심 매물 UUID';
