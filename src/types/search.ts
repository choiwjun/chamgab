// @TASK P2-R3 - 검색 관련 타입 정의
// @SPEC specs/domain/resources.yaml#popular_searches

/**
 * 순위 변동 타입
 */
export type RankChange = 'up' | 'down' | 'same'

/**
 * 인기 검색어 항목
 */
export interface PopularSearch {
  /** 현재 순위 (1부터 시작) */
  rank: number
  /** 검색 키워드 */
  keyword: string
  /** 검색 횟수 */
  search_count: number
  /** 순위 변동 방향 */
  change: RankChange
  /** 변동된 순위 수 (change가 'up' 또는 'down'일 때만 존재) */
  change_rank?: number
}

/**
 * 인기 검색어 목록 응답
 */
export interface PopularSearchesResponse {
  /** 인기 검색어 목록 */
  items: PopularSearch[]
  /** 마지막 업데이트 시간 (ISO 8601) */
  updated_at: string
}

/**
 * 검색 제안 타입
 */
export type SuggestionType = 'region' | 'complex' | 'keyword'

/**
 * 검색 자동완성 제안 항목
 */
export interface SearchSuggestion {
  /** 제안 타입 */
  type: SuggestionType
  /** 리소스 ID (region 또는 complex인 경우) */
  id?: string
  /** 표시 이름 */
  name: string
  /** 부가 설명 (예: 지역명, 주소) */
  description?: string
}

/**
 * 검색 자동완성 응답
 */
export interface SearchSuggestionsResponse {
  /** 검색 제안 목록 */
  suggestions: SearchSuggestion[]
}

/**
 * 검색 요청 파라미터
 */
export interface SearchParams {
  /** 검색 키워드 */
  q: string
  /** 결과 제한 수 */
  limit?: number
}

/**
 * 인기 검색어 요청 파라미터
 */
export interface PopularSearchParams {
  /** 결과 제한 수 (기본값: 10) */
  limit?: number
}
