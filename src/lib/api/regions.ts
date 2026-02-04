// @TASK P2-S1-T3 - Regions API 클라이언트
// @SPEC specs/domain/resources.yaml#regions

import type { RegionTrend } from '@/types/region'

// 클라이언트 사이드 폴백용 Mock 데이터
const FALLBACK_TRENDS: RegionTrend[] = [
  {
    id: 'fb-1',
    name: '강남구',
    level: 2,
    avg_price: 2850000000,
    price_change_weekly: 1.2,
    property_count: 342,
  },
  {
    id: 'fb-2',
    name: '서초구',
    level: 2,
    avg_price: 2650000000,
    price_change_weekly: 0.8,
    property_count: 287,
  },
  {
    id: 'fb-3',
    name: '송파구',
    level: 2,
    avg_price: 1980000000,
    price_change_weekly: 0.5,
    property_count: 456,
  },
  {
    id: 'fb-4',
    name: '용산구',
    level: 2,
    avg_price: 2420000000,
    price_change_weekly: -0.3,
    property_count: 198,
  },
  {
    id: 'fb-5',
    name: '마포구',
    level: 2,
    avg_price: 1580000000,
    price_change_weekly: 0.2,
    property_count: 312,
  },
  {
    id: 'fb-6',
    name: '성동구',
    level: 2,
    avg_price: 1720000000,
    price_change_weekly: 1.5,
    property_count: 245,
  },
]

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
      return FALLBACK_TRENDS.slice(0, limit)
    }

    const data = await res.json()
    const items = data.items || []
    return items.length > 0 ? items : FALLBACK_TRENDS.slice(0, limit)
  } catch (error) {
    console.error('Error fetching region trends:', error)
    return FALLBACK_TRENDS.slice(0, limit)
  }
}
