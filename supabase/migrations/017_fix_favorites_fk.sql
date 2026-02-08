-- favorites.user_id에 auth.users FK 제약 추가
-- 기존 데이터 정합성 보장을 위해 IF NOT EXISTS 패턴 사용

DO $$
BEGIN
  -- FK 제약이 아직 없는 경우에만 추가
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_favorites_user_id'
  ) THEN
    ALTER TABLE favorites
      ADD CONSTRAINT fk_favorites_user_id
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON CONSTRAINT fk_favorites_user_id ON favorites
  IS 'favorites.user_id → auth.users(id) FK 제약';
