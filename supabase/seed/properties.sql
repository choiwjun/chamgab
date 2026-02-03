-- @TASK P2-R1-T1 - Properties 시드 데이터
-- @SPEC docs/planning/04-database-design.md#properties-table
-- 서울시 주요 매물 샘플 데이터

-- 기존 데이터 제거 (개발 환경에서만)
-- DELETE FROM properties;

-- 서울시 주요 매물 데이터
INSERT INTO properties (
  id, property_type, name, address, sido, sigungu, eupmyeondong,
  location, area_exclusive, built_year, floors, thumbnail, complex_id,
  created_at
) VALUES
  -- 강남구 아파트 매물 (래미안 강남 단지)
  (
    '650e8400-e29b-41d4-a716-446655440001'::uuid,
    'apt',
    '래미안 강남 101동 1001호',
    '서울시 강남구 역삼동 123-1',
    '서울시',
    '강남구',
    '역삼동',
    ST_GeographyFromText('POINT(127.0276 37.4979)'),
    84.50,
    2015,
    10,
    'https://example.com/images/raemian-gangnam-101-1001.jpg',
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    NOW()
  ),
  (
    '650e8400-e29b-41d4-a716-446655440002'::uuid,
    'apt',
    '래미안 강남 102동 1502호',
    '서울시 강남구 역삼동 123-2',
    '서울시',
    '강남구',
    '역삼동',
    ST_GeographyFromText('POINT(127.0280 37.4982)'),
    112.30,
    2015,
    15,
    'https://example.com/images/raemian-gangnam-102-1502.jpg',
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    NOW()
  ),

  -- 강남구 오피스텔 매물
  (
    '650e8400-e29b-41d4-a716-446655440003'::uuid,
    'officetel',
    '강남 센터빌 502호',
    '서울시 강남구 테헤란로 456',
    '서울시',
    '강남구',
    '역삼동',
    ST_GeographyFromText('POINT(127.0300 37.5000)'),
    45.20,
    2018,
    5,
    'https://example.com/images/gangnam-centerville-502.jpg',
    NULL,
    NOW()
  ),

  -- 서초구 매물 (반포 래미안 푸르지오)
  (
    '650e8400-e29b-41d4-a716-446655440004'::uuid,
    'apt',
    '반포 래미안 푸르지오 301동 2001호',
    '서울시 서초구 반포동 789-1',
    '서울시',
    '서초구',
    '반포동',
    ST_GeographyFromText('POINT(127.0073 37.4823)'),
    135.80,
    2012,
    20,
    'https://example.com/images/banpo-raemian-301-2001.jpg',
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    NOW()
  ),

  -- 서초구 빌라 매물
  (
    '650e8400-e29b-41d4-a716-446655440005'::uuid,
    'villa',
    '서초빌라 A동 301호',
    '서울시 서초구 반포동 789-5',
    '서울시',
    '서초구',
    '반포동',
    ST_GeographyFromText('POINT(127.0080 37.4830)'),
    65.00,
    2010,
    3,
    'https://example.com/images/seocho-villa-a301.jpg',
    NULL,
    NOW()
  ),

  -- 송파구 매물 (롯데캐슬 잠실)
  (
    '650e8400-e29b-41d4-a716-446655440006'::uuid,
    'apt',
    '롯데캐슬 잠실 1501호',
    '서울시 송파구 잠실동 111-1',
    '서울시',
    '송파구',
    '잠실동',
    ST_GeographyFromText('POINT(127.0850 37.5145)'),
    98.50,
    2010,
    15,
    'https://example.com/images/lotte-castle-jamsil-1501.jpg',
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    NOW()
  ),

  -- 강서구 매물 (마곡 푸르지오)
  (
    '650e8400-e29b-41d4-a716-446655440007'::uuid,
    'apt',
    '마곡 푸르지오 2301호',
    '서울시 강서구 마곡동 222-1',
    '서울시',
    '강서구',
    '마곡동',
    ST_GeographyFromText('POINT(126.8420 37.5680)'),
    76.30,
    2017,
    23,
    'https://example.com/images/magok-prugio-2301.jpg',
    '550e8400-e29b-41d4-a716-446655440007'::uuid,
    NOW()
  ),

  -- 경기도 성남시 매물 (래미안 판교)
  (
    '650e8400-e29b-41d4-a716-446655440008'::uuid,
    'apt',
    '래미안 판교 501호',
    '경기도 성남시 분당구 판교역로 100-1',
    '경기도',
    '성남시',
    '분당구',
    ST_GeographyFromText('POINT(127.1113 37.3943)'),
    89.70,
    2005,
    5,
    'https://example.com/images/raemian-pangyo-501.jpg',
    '550e8400-e29b-41d4-a716-446655440008'::uuid,
    NOW()
  ),

  -- 상가 매물
  (
    '650e8400-e29b-41d4-a716-446655440009'::uuid,
    'store',
    '강남역 상가 1층 A호',
    '서울시 강남구 역삼동 500',
    '서울시',
    '강남구',
    '역삼동',
    ST_GeographyFromText('POINT(127.0285 37.4985)'),
    55.00,
    2000,
    1,
    'https://example.com/images/gangnam-store-1a.jpg',
    NULL,
    NOW()
  ),

  -- 토지 매물
  (
    '650e8400-e29b-41d4-a716-446655440010'::uuid,
    'land',
    '강남구 역삼동 토지',
    '서울시 강남구 역삼동 600',
    '서울시',
    '강남구',
    '역삼동',
    ST_GeographyFromText('POINT(127.0290 37.4990)'),
    200.00,
    NULL,
    NULL,
    NULL,
    NULL,
    NOW()
  );

-- 인덱스 재구성
VACUUM ANALYZE properties;
