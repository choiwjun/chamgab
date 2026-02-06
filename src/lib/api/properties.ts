// @TASK P2-S1-T4 - Properties API 클라이언트
// @SPEC specs/domain/resources.yaml#properties

import type {
  Property,
  PropertyResponse,
  SearchSuggestion,
} from '@/types/property'

const getBaseUrl = () => {
  if (typeof window !== 'undefined') return '' // 클라이언트
  // Vercel 환경 감지
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000' // 서버
}

/**
 * 인기 매물 목록 조회
 * @param limit 조회 개수 (기본 10개)
 */
export async function getPopularProperties(limit = 10): Promise<Property[]> {
  try {
    const res = await fetch(
      `${getBaseUrl()}/api/properties?sort=views_desc&limit=${limit}`,
      {
        next: { revalidate: 300 }, // 5분 캐시
      }
    )

    if (!res.ok) {
      console.error('Failed to fetch popular properties:', res.statusText)
      return []
    }

    const data: PropertyResponse = await res.json()
    return data.items || []
  } catch (error) {
    console.error('Error fetching popular properties:', error)
    return []
  }
}

/**
 * 검색 자동완성
 * @param query 검색어 (최소 2자)
 */
export async function searchAutocomplete(
  query: string
): Promise<SearchSuggestion[]> {
  if (query.length < 2) return []

  try {
    const res = await fetch(
      `${getBaseUrl()}/api/properties/autocomplete?q=${encodeURIComponent(query)}`,
      {
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      console.error('Failed to fetch autocomplete:', res.statusText)
      return []
    }

    const data = await res.json()
    return data.suggestions || []
  } catch (error) {
    console.error('Error fetching autocomplete:', error)
    return []
  }
}
