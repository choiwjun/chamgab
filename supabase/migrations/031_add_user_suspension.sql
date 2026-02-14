-- P6-ADMIN-2: User suspension fields for operational admin console.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_suspended_until
  ON public.user_profiles (is_suspended, suspended_until);

COMMENT ON COLUMN public.user_profiles.is_suspended IS '운영자에 의한 계정 정지 여부';
COMMENT ON COLUMN public.user_profiles.suspended_until IS '정지 만료 시각 (NULL이면 해제/미설정)';
COMMENT ON COLUMN public.user_profiles.suspended_reason IS '정지 사유(내부)';

