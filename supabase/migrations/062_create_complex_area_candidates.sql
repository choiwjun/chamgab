CREATE TABLE IF NOT EXISTS public.complex_area_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id UUID NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  area_exclusive DECIMAL(10,2) NOT NULL CHECK (area_exclusive > 0),
  source_type TEXT NOT NULL CHECK (
    source_type IN ('transaction', 'property', 'mixed')
  ),
  transaction_count INT NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  property_count INT NOT NULL DEFAULT 0 CHECK (property_count >= 0),
  confidence_grade TEXT NOT NULL DEFAULT 'medium' CHECK (
    confidence_grade IN ('high', 'medium', 'low')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (complex_id, area_exclusive)
);

CREATE INDEX IF NOT EXISTS idx_complex_area_candidates_complex
  ON public.complex_area_candidates (complex_id);

CREATE INDEX IF NOT EXISTS idx_complex_area_candidates_complex_area
  ON public.complex_area_candidates (complex_id, area_exclusive);

CREATE OR REPLACE FUNCTION public.update_complex_area_candidates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_complex_area_candidates_updated_at
  ON public.complex_area_candidates;

CREATE TRIGGER trigger_update_complex_area_candidates_updated_at
  BEFORE UPDATE ON public.complex_area_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_complex_area_candidates_updated_at();

ALTER TABLE public.complex_area_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "complex_area_candidates_select_public"
  ON public.complex_area_candidates;
CREATE POLICY "complex_area_candidates_select_public"
  ON public.complex_area_candidates
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "complex_area_candidates_insert_service_role"
  ON public.complex_area_candidates;
CREATE POLICY "complex_area_candidates_insert_service_role"
  ON public.complex_area_candidates
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "complex_area_candidates_update_service_role"
  ON public.complex_area_candidates;
CREATE POLICY "complex_area_candidates_update_service_role"
  ON public.complex_area_candidates
  FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "complex_area_candidates_delete_service_role"
  ON public.complex_area_candidates;
CREATE POLICY "complex_area_candidates_delete_service_role"
  ON public.complex_area_candidates
  FOR DELETE
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.complex_area_candidates IS
  '단지별 평형 후보 캐시 테이블';

COMMENT ON COLUMN public.complex_area_candidates.area_exclusive IS
  '단지 후보 전용면적(㎡)';
