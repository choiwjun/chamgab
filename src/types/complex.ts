// @TASK P2-R0-T1 - Complexes 타입 정의
// @SPEC docs/planning/04-database-design.md#complexes-table
// @SPEC specs/domain/resources.yaml#complexes

/**
 * 아파트 단지 정보 (Complexes)
 *
 * 공간 쿼리를 위한 PostGIS location 필드 포함
 * - location: GEOGRAPHY(POINT, 4326) - 위도, 경도
 */
export interface Complex {
  /** 단지 고유 ID (UUID) */
  id: string

  /** 단지명 (최대 200자) */
  name: string

  /** 주소 (최대 500자) */
  address: string

  /** 시도 (서울시, 경기도 등) */
  sido: string

  /** 시군구 (강남구, 서초구 등) */
  sigungu: string

  /** 읍면동 (선택사항) */
  eupmyeondong?: string

  /** 위치 좌표 (위도, 경도) */
  location?: {
    /** 위도 (-90 ~ 90) */
    lat: number
    /** 경도 (-180 ~ 180) */
    lng: number
  }

  /** 총 세대수 (선택사항) */
  total_units?: number

  /** 총 동수 (선택사항) */
  total_buildings?: number

  /** 준공년도 (선택사항) */
  built_year?: number

  /** 주차대수비율 (선택사항) */
  parking_ratio?: number

  /** 브랜드명 (래미안, 자이 등) (선택사항) */
  brand?: string

  /** 생성 시간 */
  created_at: string

  /** 수정 시간 (선택사항) */
  updated_at?: string
}

/**
 * Complexes 테이블 생성 요청 (INSERT)
 */
export interface CreateComplexInput {
  name: string
  address: string
  sido: string
  sigungu: string
  eupmyeondong?: string
  location?: {
    lat: number
    lng: number
  }
  total_units?: number
  total_buildings?: number
  built_year?: number
  parking_ratio?: number
  brand?: string
}

/**
 * Complexes 테이블 업데이트 요청 (UPDATE)
 */
export interface UpdateComplexInput {
  name?: string
  address?: string
  sido?: string
  sigungu?: string
  eupmyeondong?: string
  location?: {
    lat: number
    lng: number
  }
  total_units?: number
  total_buildings?: number
  built_year?: number
  parking_ratio?: number
  brand?: string
}

/**
 * 공간 검색 쿼리 파라미터
 */
export interface ComplexSearchParams {
  /** 반경 (미터) */
  radius?: number
  /** 중심점 위도 */
  lat?: number
  /** 중심점 경도 */
  lng?: number
  /** 시도 필터 */
  sido?: string
  /** 시군구 필터 */
  sigungu?: string
  /** 검색어 (단지명) */
  keyword?: string
  /** 페이지 번호 */
  page?: number
  /** 페이지 사이즈 */
  limit?: number
}
