// @TASK P2-S1-T3 - Regions API 클라이언트
// @SPEC specs/domain/resources.yaml#regions

import type { RegionTrend } from '@/types/region'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

/**
 * 지역별 가격 트렌드 조회
 * @param limit 조회 개수 (기본 6개)
 */
export async function getRegionTrends(limit = 6): Promise<RegionTrend[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/regions/trends?type=sigungu&limit=${limit}`,
      {
        next: { revalidate: 3600 }, // 1시간 캐시
      },
    )

    if (!res.ok) {
      console.error('Failed to fetch region trends:', res.statusText)
      return []
    }

    const data = await res.json()
    return data.items || []
  } catch (error) {
    console.error('Error fetching region trends:', error)
    return []
  }
}
