-- Migration 020: 건축물대장 API 데이터 저장 테이블 생성
-- 건축물대장 API (getBrRecapTitleInfo)의 응답 데이터를 저장하기 위한 테이블
-- 건물의 물리적 정보(규모, 면적, 구조, 주차 등)를 포함

-- 1. building_info 테이블 생성
CREATE TABLE IF NOT EXISTS public.building_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 식별 정보
  complex_id UUID REFERENCES public.complexes(id) ON DELETE SET NULL,
  sigungu_cd VARCHAR(5) NOT NULL,      -- 시군구코드 (e.g., '27710' for 강남구)
  bjdong_cd VARCHAR(5) NOT NULL,       -- 법정동코드
  bun VARCHAR(4),                       -- 번 (지번)
  ji VARCHAR(4),                        -- 지 (지번)
  mgm_bld_rgst_pk VARCHAR(50),         -- 관리건축물대장 PK (건물 고유 식별자)

  -- 건물 기본 정보
  bld_nm VARCHAR(200),                  -- 건물명
  plat_plc VARCHAR(500),               -- 대지위치(지번)
  new_plat_plc VARCHAR(500),           -- 도로명대지위치
  main_purps_cd_nm VARCHAR(100),       -- 주용도 (아파트, 오피스텔 등)
  etc_purps VARCHAR(500),              -- 기타용도

  -- 규모 정보
  hhld_cnt INT,                         -- 세대수
  fmly_cnt INT,                         -- 가구수
  ho_cnt INT,                           -- 호수
  grnd_flr_cnt INT,                     -- 지상층수
  ugrnd_flr_cnt INT,                    -- 지하층수
  tot_dong_cnt INT,                     -- 총동수

  -- 면적 정보 (㎡)
  plat_area DECIMAL(15,2),             -- 대지면적
  arch_area DECIMAL(15,2),             -- 건축면적
  bc_rat DECIMAL(8,4),                 -- 건폐율 (건축면적 / 대지면적)
  tot_area DECIMAL(15,2),              -- 연면적 (모든 층의 합)
  vl_rat_estm_tot_area DECIMAL(15,2),  -- 용적률산정연면적
  vl_rat DECIMAL(8,4),                 -- 용적률 (연면적 / 대지면적)

  -- 주차 정보
  tot_pkng_cnt INT,                     -- 총주차대수
  indoor_mech_pkng_cnt INT,            -- 옥내기계식주차대수
  indoor_self_pkng_cnt INT,            -- 옥내자주식주차대수
  outdr_mech_pkng_cnt INT,             -- 옥외기계식주차대수
  outdr_self_pkng_cnt INT,             -- 옥외자주식주차대수

  -- 건물 구조
  strct_cd_nm VARCHAR(100),            -- 구조 (철근콘크리트, 철골 등)
  etc_strct VARCHAR(500),              -- 기타구조 설명

  -- 일자 정보
  pms_day VARCHAR(8),                   -- 허가일 (YYYYMMDD)
  stcns_day VARCHAR(8),                 -- 착공일 (YYYYMMDD)
  use_apr_day VARCHAR(8),              -- 사용승인일 (YYYYMMDD)
  crtn_day VARCHAR(8),                 -- 생성일자 (YYYYMMDD)

  -- 메타
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB,                       -- 원본 API 응답 전체 (중복 방지, 감시용)

  -- UNIQUE 제약조건: 같은 건물이 중복되지 않도록
  UNIQUE (sigungu_cd, bjdong_cd, bun, ji, mgm_bld_rgst_pk)
);

-- 2. building_info 테이블 인덱스
-- complex_id 기반 조회
CREATE INDEX IF NOT EXISTS idx_building_info_complex_id
ON public.building_info(complex_id);

-- 시군구코드 + 법정동코드 기반 조회
CREATE INDEX IF NOT EXISTS idx_building_info_sigungu_bjdong
ON public.building_info(sigungu_cd, bjdong_cd);

-- 건물명 텍스트 검색 (GIN 인덱스 + pg_trgm 확장)
CREATE INDEX IF NOT EXISTS idx_building_info_bld_nm
ON public.building_info USING GIN(bld_nm gin_trgm_ops);

-- 3. complexes 테이블 확장 (건축물대장에서 제공하는 추가 정보)
ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS total_floors INT;                      -- 지상층수

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS dong_count INT;                        -- 총동수

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS floor_area_ratio DECIMAL(8,4);         -- 용적률

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS building_coverage_ratio DECIMAL(8,4);  -- 건폐율

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS main_use VARCHAR(100);                 -- 주용도

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS structure VARCHAR(100);                -- 구조

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS use_approval_date DATE;                -- 사용승인일

ALTER TABLE IF EXISTS public.complexes
ADD COLUMN IF NOT EXISTS building_info_id UUID REFERENCES public.building_info(id);

-- 4. 주석 추가
COMMENT ON TABLE public.building_info IS '건축물대장 API 데이터 테이블 - 건물의 물리적 정보 저장';
COMMENT ON COLUMN public.building_info.complex_id IS '연관된 매물 단지';
COMMENT ON COLUMN public.building_info.mgm_bld_rgst_pk IS '관리건축물대장 PK - 건물 고유 식별자';
COMMENT ON COLUMN public.building_info.bc_rat IS '건폐율: 건축면적 / 대지면적';
COMMENT ON COLUMN public.building_info.vl_rat IS '용적률: 연면적 / 대지면적';
COMMENT ON COLUMN public.building_info.raw_data IS '원본 API 응답 전체 (감사/감시용)';
