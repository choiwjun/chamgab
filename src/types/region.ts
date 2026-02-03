// @TASK P2-R2 - 지역 정보 (Regions) 타입 정의
// @SPEC docs/planning/04-database-design.md#regions-table
// @SPEC specs/domain/resources.yaml#regions

/**
 * 지역 정보 (Regions)
 *
 * 계층형 지역 구조 (시도 → 시군구 → 읍면동)
 * 검색 필터링 및 가격 트렌드 분석용
 */
export interface Region {
  /** 지역 고유 ID (UUID) */
  id: string

  /** 법정동코드 (10자리, UNIQUE) */
  code: string

  /** 지역명 (시도/시군구/읍면동) */
  name: string

  /** 계층 레벨 (1: 시도, 2: 시군구, 3: 읍면동) */
  level: 1 | 2 | 3

  /** 상위 지역 코드 (null인 경우 최상위) */
  parent_code?: string

  /** 위도 */
  latitude?: number

  /** 경도 */
  longitude?: number

  /** 평균 가격 (캐시) - 원 단위 */
  avg_price?: number

  /** 주간 변동률 (캐시) - 퍼센트 */
  price_change_weekly?: number

  /** 생성 시간 */
  created_at: string

  /** 수정 시간 */
  updated_at: string
}

/**
 * 자식 지역 포함된 계층형 Region
 */
export interface RegionWithChildren extends Region {
  /** 자식 지역 목록 (재귀 구조) */
  children?: RegionWithChildren[]
}

/**
 * 가격 트렌드 정보
 */
export interface RegionTrend {
  id: string
  name: string
  level: 1 | 2 | 3
  avg_price?: number
  price_change_weekly?: number
  property_count?: number
}

/**
 * 지역 목록 조회 쿼리 파라미터
 */
export interface RegionQueryParams {
  /** 계층 레벨 필터 (1, 2, 3) */
  level?: 1 | 2 | 3

  /** 상위 지역 코드 (parent_code 필터) */
  parent_code?: string

  /** 검색어 (지역명) */
  keyword?: string

  /** 페이지 번호 */
  page?: number

  /** 페이지 사이즈 */
  limit?: number
}

/**
 * 지역 생성 요청
 */
export interface CreateRegionInput {
  code: string
  name: string
  level: 1 | 2 | 3
  parent_code?: string
  latitude?: number
  longitude?: number
}

/**
 * 지역 업데이트 요청
 */
export interface UpdateRegionInput {
  avg_price?: number
  price_change_weekly?: number
}
