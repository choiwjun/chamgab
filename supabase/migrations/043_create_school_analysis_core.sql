-- Phase 7: School Analysis core schema

CREATE TABLE IF NOT EXISTS public.school_districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_code VARCHAR(20) NOT NULL UNIQUE,
  district_name TEXT NOT NULL,
  sido_code VARCHAR(5),
  sigungu_code VARCHAR(10),
  geom GEOGRAPHY(MULTIPOLYGON, 4326),
  source TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL UNIQUE,
  school_name TEXT NOT NULL,
  school_level VARCHAR(20) NOT NULL DEFAULT 'other',
  district_code VARCHAR(20),
  sido_code VARCHAR(5),
  sigungu_code VARCHAR(10),
  address TEXT,
  postal_code VARCHAR(10),
  location GEOGRAPHY(POINT, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schools_school_level_check
    CHECK (school_level IN ('elementary', 'middle', 'high', 'other'))
);

CREATE TABLE IF NOT EXISTS public.school_district_school_map (
  district_code VARCHAR(20) NOT NULL,
  school_id VARCHAR(64) NOT NULL,
  mapping_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (district_code, school_id),
  CONSTRAINT school_map_district_code_fk
    FOREIGN KEY (district_code)
    REFERENCES public.school_districts(district_code)
    ON DELETE CASCADE,
  CONSTRAINT school_map_school_id_fk
    FOREIGN KEY (school_id)
    REFERENCES public.schools(school_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.school_metrics_official (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL,
  metric_year INT NOT NULL,
  metric_term VARCHAR(20) NOT NULL DEFAULT 'annual',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  source_url TEXT,
  source_updated_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT school_metrics_official_school_id_fk
    FOREIGN KEY (school_id)
    REFERENCES public.schools(school_id)
    ON DELETE CASCADE,
  CONSTRAINT school_metrics_official_unique
    UNIQUE (school_id, metric_year, metric_term)
);

CREATE TABLE IF NOT EXISTS public.school_progression_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL,
  base_year INT NOT NULL,
  destination_type VARCHAR(40) NOT NULL,
  progression_rate NUMERIC(5, 2),
  student_count INT,
  metric_provenance VARCHAR(20) NOT NULL DEFAULT 'official',
  source TEXT,
  source_url TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT school_progression_stats_school_id_fk
    FOREIGN KEY (school_id)
    REFERENCES public.schools(school_id)
    ON DELETE CASCADE,
  CONSTRAINT school_progression_stats_destination_type_check
    CHECK (
      destination_type IN (
        'general_highschool',
        'special_purpose_highschool',
        'autonomy_highschool',
        'college',
        'other'
      )
    ),
  CONSTRAINT school_progression_stats_metric_provenance_check
    CHECK (metric_provenance IN ('official', 'inferred')),
  CONSTRAINT school_progression_stats_unique
    UNIQUE (school_id, base_year, destination_type)
);

CREATE TABLE IF NOT EXISTS public.academies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id VARCHAR(64) NOT NULL UNIQUE,
  academy_name TEXT NOT NULL,
  sigungu_code VARCHAR(10),
  address TEXT,
  subject_category TEXT,
  location GEOGRAPHY(POINT, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id VARCHAR(64) NOT NULL,
  subject_name TEXT NOT NULL,
  grade_band VARCHAR(30),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
  fee_amount NUMERIC(12, 0) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'KRW',
  metric_provenance VARCHAR(20) NOT NULL DEFAULT 'official',
  as_of_date DATE NOT NULL,
  source TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academy_fees_academy_id_fk
    FOREIGN KEY (academy_id)
    REFERENCES public.academies(academy_id)
    ON DELETE CASCADE,
  CONSTRAINT academy_fees_billing_cycle_check
    CHECK (billing_cycle IN ('monthly', 'weekly', 'quarterly', 'yearly', 'other')),
  CONSTRAINT academy_fees_metric_provenance_check
    CHECK (metric_provenance IN ('official', 'inferred')),
  CONSTRAINT academy_fees_unique
    UNIQUE (academy_id, subject_name, grade_band, billing_cycle, as_of_date)
);

CREATE TABLE IF NOT EXISTS public.school_analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  district_code VARCHAR(20) NOT NULL,
  district_name TEXT NOT NULL,
  request_hash VARCHAR(128) NOT NULL,
  report_payload JSONB NOT NULL,
  data_freshness TIMESTAMPTZ NOT NULL,
  confidence_score NUMERIC(5, 2) NOT NULL,
  formula_version VARCHAR(30) NOT NULL DEFAULT 'v1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT school_analysis_reports_confidence_check
    CHECK (confidence_score >= 0 AND confidence_score <= 100),
  CONSTRAINT school_analysis_reports_unique_request
    UNIQUE (user_id, request_hash)
);

CREATE TABLE IF NOT EXISTS public.school_analysis_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL
    REFERENCES public.school_analysis_reports(id)
    ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  token_prefix VARCHAR(20),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial/performance indexes
CREATE INDEX IF NOT EXISTS idx_school_districts_geom
  ON public.school_districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_schools_location
  ON public.schools USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_school_districts_sigungu_code
  ON public.school_districts(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_school_districts_updated_at
  ON public.school_districts(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_schools_district_code
  ON public.schools(district_code);
CREATE INDEX IF NOT EXISTS idx_schools_sigungu_code
  ON public.schools(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_schools_updated_at
  ON public.schools(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_school_metrics_official_school_year
  ON public.school_metrics_official(school_id, metric_year DESC);
CREATE INDEX IF NOT EXISTS idx_school_metrics_official_updated_at
  ON public.school_metrics_official(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_school_progression_stats_school_year
  ON public.school_progression_stats(school_id, base_year DESC);
CREATE INDEX IF NOT EXISTS idx_school_progression_stats_updated_at
  ON public.school_progression_stats(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_academies_sigungu_code
  ON public.academies(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_academies_updated_at
  ON public.academies(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_academy_fees_academy_date
  ON public.academy_fees(academy_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_academy_fees_updated_at
  ON public.academy_fees(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_school_analysis_reports_user_created
  ON public.school_analysis_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_analysis_reports_district_created
  ON public.school_analysis_reports(district_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_school_analysis_share_tokens_report_created
  ON public.school_analysis_share_tokens(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_analysis_share_tokens_expires
  ON public.school_analysis_share_tokens(expires_at);

-- updated_at triggers
DROP TRIGGER IF EXISTS update_school_districts_updated_at ON public.school_districts;
CREATE TRIGGER update_school_districts_updated_at
  BEFORE UPDATE ON public.school_districts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_schools_updated_at ON public.schools;
CREATE TRIGGER update_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_school_metrics_official_updated_at ON public.school_metrics_official;
CREATE TRIGGER update_school_metrics_official_updated_at
  BEFORE UPDATE ON public.school_metrics_official
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_school_progression_stats_updated_at ON public.school_progression_stats;
CREATE TRIGGER update_school_progression_stats_updated_at
  BEFORE UPDATE ON public.school_progression_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_academies_updated_at ON public.academies;
CREATE TRIGGER update_academies_updated_at
  BEFORE UPDATE ON public.academies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_academy_fees_updated_at ON public.academy_fees;
CREATE TRIGGER update_academy_fees_updated_at
  BEFORE UPDATE ON public.academy_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_school_analysis_reports_updated_at ON public.school_analysis_reports;
CREATE TRIGGER update_school_analysis_reports_updated_at
  BEFORE UPDATE ON public.school_analysis_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
