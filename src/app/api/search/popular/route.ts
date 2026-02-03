// @TASK P2-R3-T1 - 인기 검색어 API
// @SPEC specs/domain/resources.yaml#popular_searches

import { NextRequest, NextResponse } from 'next/server'
import type { PopularSearch, PopularSearchesResponse } from '@/types/search'

/**
 * 인기 검색어 목 데이터
 * TODO: 추후 Redis 캐시로 실시간 집계 데이터로 교체
 */
const MOCK_POPULAR_SEARCHES: PopularSearch[] = [
  { rank: 1, keyword: '강남구', search_count: 1523, change: 'same' },
  { rank: 2, keyword: '잠실', search_count: 1234, change: 'up', change_rank: 2 },
  { rank: 3, keyword: '마포구', search_count: 987, change: 'down', change_rank: 1 },
  { rank: 4, keyword: '판교', search_count: 876, change: 'up', change_rank: 3 },
  { rank: 5, keyword: '래미안', search_count: 765, change: 'same' },
  { rank: 6, keyword: '서초구', search_count: 654, change: 'down', change_rank: 2 },
  { rank: 7, keyword: '송파구', search_count: 543, change: 'up', change_rank: 1 },
  { rank: 8, keyword: '분당', search_count: 432, change: 'same' },
  { rank: 9, keyword: '용산', search_count: 321, change: 'up', change_rank: 4 },
  { rank: 10, keyword: '청담동', search_count: 210, change: 'down', change_rank: 3 },
]

/**
 * 마지막 업데이트 시간 (캐시용)
 * TODO: 추후 Redis에서 실제 업데이트 시간 조회
 */
const getLastUpdatedAt = (): string => {
  // 현재 시간에서 1시간 전으로 설정 (캐시 시뮬레이션)
  const date = new Date()
  date.setHours(date.getHours() - 1)
  return date.toISOString()
}

/**
 * GET /api/search/popular
 * 인기 검색어 목록을 반환합니다.
 *
 * Query Parameters:
 * - limit: 반환할 최대 개수 (기본값: 10, 최대: 20)
 *
 * Response:
 * - items: PopularSearch[] - 인기 검색어 목록
 * - updated_at: string - 마지막 업데이트 시간 (ISO 8601)
 */
export async function GET(request: NextRequest): Promise<NextResponse<PopularSearchesResponse>> {
  try {
    // Query parameter 파싱
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')

    // limit 값 파싱 및 검증 (기본값: 10, 최대: 20)
    let limit = 10
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 20)
      }
    }

    // 인기 검색어 목록 (limit 적용)
    const items = MOCK_POPULAR_SEARCHES.slice(0, limit)

    const response: PopularSearchesResponse = {
      items,
      updated_at: getLastUpdatedAt(),
    }

    // Cache-Control 헤더 설정 (5분 캐시)
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('[Popular Searches API] Error:', error)

    return NextResponse.json(
      {
        items: [],
        updated_at: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
