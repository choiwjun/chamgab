-- P3-DATA-3: Add sigungu_code (LAWD_CD 5-digit) to complexes for unambiguous linking.
--
-- Background:
-- - transactions.region_code stores LAWD_CD (5-digit 시군구 코드)
-- - many sigungu names are ambiguous across cities (e.g., 중구/동구/서구/남구/북구)
-- - linking by (apt_name, sigungu text) can miss or mis-link in edge cases
-- - storing sigungu_code on complexes allows deterministic linking and safer fallbacks

ALTER TABLE public.complexes
  ADD COLUMN IF NOT EXISTS sigungu_code VARCHAR(10);

COMMENT ON COLUMN public.complexes.sigungu_code IS
  '시군구 코드(LAWD_CD 5자리). transactions.region_code 와 매칭용';

CREATE INDEX IF NOT EXISTS idx_complexes_sigungu_code
  ON public.complexes(sigungu_code);

