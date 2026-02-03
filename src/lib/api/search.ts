// @TASK P2-S1-T2 - Search API 클라이언트
// @SPEC specs/domain/resources.yaml#popular_searches

import type { PopularSearchesResponse } from '@/types/search'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

/**
 * 인기 검색어 목록 조회
 * @param limit 조회 개수 (기본 10개)
 */
export async function getPopularSearches(limit = 10): Promise<PopularSearchesResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/search/popular?limit=${limit}`, {
      next: { revalidate: 600 }, // 10분 캐시
    })

    if (!res.ok) {
      console.error('Failed to fetch popular searches:', res.statusText)
      return { items: [], updated_at: new Date().toISOString() }
    }

    return res.json()
  } catch (error) {
    console.error('Error fetching popular searches:', error)
    return { items: [], updated_at: new Date().toISOString() }
  }
}
