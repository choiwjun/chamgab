-- @TASK P2-R0-T1 - Complexes 시드 데이터
-- @SPEC docs/planning/04-database-design.md#complexes-table
-- 서울시 주요 아파트 단지 샘플 데이터

-- 기존 데이터 제거 (개발 환경에서만)
-- DELETE FROM complexes;

-- 서울시 주요 아파트 단지 데이터
INSERT INTO complexes (
  id, name, address, sido, sigungu, eupmyeondong,
  location, total_units, total_buildings, built_year, parking_ratio, brand,
  created_at, updated_at
) VALUES
  -- 강남구
  (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    '래미안 강남',
    '서울시 강남구 역삼동 123',
    '서울시',
    '강남구',
    '역삼동',
    ST_GeographyFromText('POINT(127.0276 37.4979)'),
    800,
    16,
    2015,
    1.2,
    '래미안',
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    '자이 강남',
    '서울시 강남구 신사동 456',
    '서울시',
    '강남구',
    '신사동',
    ST_GeographyFromText('POINT(127.0143 37.5150)'),
    600,
    12,
    2018,
    1.0,
    '자이',
    NOW(),
    NOW()
  ),

  -- 서초구
  (
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    '반포 래미안 푸르지오',
    '서울시 서초구 반포동 789',
    '서울시',
    '서초구',
    '반포동',
    ST_GeographyFromText('POINT(127.0073 37.4823)'),
    1200,
    20,
    2012,
    1.5,
    '래미안',
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440004'::uuid,
    '자이 서초',
    '서울시 서초구 서초동 321',
    '서울시',
    '서초구',
    '서초동',
    ST_GeographyFromText('POINT(127.0232 37.4945)'),
    450,
    9,
    2020,
    0.9,
    '자이',
    NOW(),
    NOW()
  ),

  -- 종로구
  (
    '550e8400-e29b-41d4-a716-446655440005'::uuid,
    '경복궁 래미안',
    '서울시 종로구 청와대로 654',
    '서울시',
    '종로구',
    '평창동',
    ST_GeographyFromText('POINT(126.9837 37.5917)'),
    500,
    10,
    2008,
    1.1,
    '래미안',
    NOW(),
    NOW()
  ),

  -- 송파구
  (
    '550e8400-e29b-41d4-a716-446655440006'::uuid,
    '롯데캐슬 잠실',
    '서울시 송파구 잠실동 111',
    '서울시',
    '송파구',
    '잠실동',
    ST_GeographyFromText('POINT(127.0850 37.5145)'),
    1500,
    25,
    2010,
    1.3,
    '롯데',
    NOW(),
    NOW()
  ),

  -- 강서구
  (
    '550e8400-e29b-41d4-a716-446655440007'::uuid,
    '마곡 푸르지오',
    '서울시 강서구 마곡동 222',
    '서울시',
    '강서구',
    '마곡동',
    ST_GeographyFromText('POINT(126.8420 37.5680)'),
    2000,
    30,
    2017,
    1.4,
    '현대',
    NOW(),
    NOW()
  ),

  -- 경기도 성남시
  (
    '550e8400-e29b-41d4-a716-446655440008'::uuid,
    '래미안 판교',
    '경기도 성남시 분당구 판교역로 100',
    '경기도',
    '성남시',
    '분당구',
    ST_GeographyFromText('POINT(127.1113 37.3943)'),
    1200,
    24,
    2005,
    1.5,
    '래미안',
    NOW(),
    NOW()
  ),

  -- 경기도 고양시
  (
    '550e8400-e29b-41d4-a716-446655440009'::uuid,
    '일산 힐스테이트',
    '경기도 고양시 일산동구 중앙로 200',
    '경기도',
    '고양시',
    '일산동구',
    ST_GeographyFromText('POINT(126.7665 37.6839)'),
    1800,
    28,
    2014,
    1.2,
    '현대',
    NOW(),
    NOW()
  ),

  -- 경기도 수원시
  (
    '550e8400-e29b-41d4-a716-446655440010'::uuid,
    '수원 자이',
    '경기도 수원시 영통구 이의동 300',
    '경기도',
    '수원시',
    '영통구',
    ST_GeographyFromText('POINT(127.0596 37.2635)'),
    950,
    19,
    2016,
    1.1,
    '자이',
    NOW(),
    NOW()
  );

-- 인덱스 재구성 (VACUUM ANALYZE)
VACUUM ANALYZE complexes;
