-- Migration 047: 시군구별 대학진학률 공식 통계 테이블
-- Source: 한국교육개발원 (api.odcloud.kr/api/15053808/v1)
-- Granularity: 시군구 단위 연도별 고교졸업자 대학진학률

CREATE TABLE IF NOT EXISTS public.sigungu_advancement_stats (
  sigungu_code  VARCHAR(10)    NOT NULL,   -- 5자리 LAWD_CD (schools.sigungu_code 와 일치)
  year          INTEGER        NOT NULL,   -- 기준 연도 (2020~2025)
  sido_name     VARCHAR(30)    NOT NULL,   -- 시도명 (API 원본)
  sigungu_name  VARCHAR(50)    NOT NULL,   -- 시군구명 (API 원본)
  graduates     INTEGER,                   -- 졸업자 수
  advanced_students INTEGER,              -- 진학자 수
  advancement_rate NUMERIC(5, 2),         -- 진학률 (%)
  source        TEXT           DEFAULT 'odcloud_15053808',
  source_url    TEXT,
  source_updated_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sigungu_code, year)
);

COMMENT ON TABLE public.sigungu_advancement_stats IS
  '한국교육개발원_시도 시군구별 졸업자 진학자 진학률 (odcloud 15053808)';

CREATE INDEX IF NOT EXISTS idx_sas_year
  ON public.sigungu_advancement_stats (year);

-- RLS: 공개 읽기
ALTER TABLE public.sigungu_advancement_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sas_select_public" ON public.sigungu_advancement_stats
  FOR SELECT USING (true);

CREATE POLICY "sas_insert_service" ON public.sigungu_advancement_stats
  FOR INSERT WITH CHECK (true);

CREATE POLICY "sas_update_service" ON public.sigungu_advancement_stats
  FOR UPDATE USING (true);
