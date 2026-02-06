// @TASK P2-S1-T3 - Regions API 클라이언트
// @SPEC specs/domain/resources.yaml#regions

import type { RegionTrend } from '@/types/region'

const getBaseUrl = () => {
  if (typeof window !== 'undefined') return '' // 클라이언트
  // Vercel 환경 감지
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000' // 서버
}

/**
 * 지역별 가격 트렌드 조회
 * @param limit 조회 개수 (기본 6개)
 */
export async function getRegionTrends(limit = 6): Promise<RegionTrend[]> {
  try {
    const res = await fetch(
      `${getBaseUrl()}/api/regions/trends?level=2&limit=${limit}`,
      {
        next: { revalidate: 3600 }, // 1시간 캐시
      }
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
