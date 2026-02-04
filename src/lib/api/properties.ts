// @TASK P2-S1-T4 - Properties API 클라이언트
// @SPEC specs/domain/resources.yaml#properties

import type {
  Property,
  PropertyResponse,
  SearchSuggestion,
} from '@/types/property'

// 클라이언트 사이드 폴백용 Mock 데이터
const FALLBACK_PROPERTIES: Property[] = [
  {
    id: 'fb-1',
    name: '래미안 강남 포레스트',
    address: '서울시 강남구 역삼동 123',
    sido: '서울특별시',
    sigungu: '강남구',
    property_type: 'apt',
    price: 2850000000,
    area_exclusive: 84.5,
    floor: 18,
    total_floors: 35,
    building_name: '래미안 강남 포레스트',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-2',
    name: '아크로리버파크',
    address: '서울시 서초구 반포동 456',
    sido: '서울특별시',
    sigungu: '서초구',
    property_type: 'apt',
    price: 4200000000,
    area_exclusive: 112.3,
    floor: 25,
    total_floors: 42,
    building_name: '아크로리버파크',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-3',
    name: '잠실 엘스',
    address: '서울시 송파구 잠실동 789',
    sido: '서울특별시',
    sigungu: '송파구',
    property_type: 'apt',
    price: 2100000000,
    area_exclusive: 84.9,
    floor: 12,
    total_floors: 28,
    building_name: '잠실 엘스',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-4',
    name: '힐스테이트 갤러리',
    address: '서울시 용산구 한남동 234',
    sido: '서울특별시',
    sigungu: '용산구',
    property_type: 'apt',
    price: 3500000000,
    area_exclusive: 134.5,
    floor: 22,
    total_floors: 45,
    building_name: '힐스테이트 갤러리',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-5',
    name: '마포 래미안 푸르지오',
    address: '서울시 마포구 아현동 567',
    sido: '서울특별시',
    sigungu: '마포구',
    property_type: 'apt',
    price: 1580000000,
    area_exclusive: 59.9,
    floor: 8,
    total_floors: 25,
    building_name: '마포 래미안 푸르지오',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-6',
    name: '성수동 트리마제',
    address: '서울시 성동구 성수동 890',
    sido: '서울특별시',
    sigungu: '성동구',
    property_type: 'apt',
    price: 1920000000,
    area_exclusive: 84.2,
    floor: 15,
    total_floors: 32,
    building_name: '트리마제',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-7',
    name: '반포 자이',
    address: '서울시 서초구 반포동 111',
    sido: '서울특별시',
    sigungu: '서초구',
    property_type: 'apt',
    price: 3800000000,
    area_exclusive: 112.5,
    floor: 28,
    total_floors: 38,
    building_name: '반포 자이',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-8',
    name: '청담 아이파크',
    address: '서울시 강남구 청담동 222',
    sido: '서울특별시',
    sigungu: '강남구',
    property_type: 'apt',
    price: 5200000000,
    area_exclusive: 165.3,
    floor: 32,
    total_floors: 40,
    building_name: '청담 아이파크',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-9',
    name: '동작 롯데캐슬',
    address: '서울시 동작구 사당동 333',
    sido: '서울특별시',
    sigungu: '동작구',
    property_type: 'apt',
    price: 1250000000,
    area_exclusive: 59.5,
    floor: 10,
    total_floors: 22,
    building_name: '동작 롯데캐슬',
    image_url: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fb-10',
    name: '목동 하이페리온',
    address: '서울시 양천구 목동 444',
    sido: '서울특별시',
    sigungu: '양천구',
    property_type: 'apt',
    price: 1680000000,
    area_exclusive: 84.8,
    floor: 14,
    total_floors: 30,
    building_name: '목동 하이페리온',
    image_url: null,
    created_at: new Date().toISOString(),
  },
]

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
      return FALLBACK_PROPERTIES.slice(0, limit)
    }

    const data: PropertyResponse = await res.json()
    const items = data.items || []
    return items.length > 0 ? items : FALLBACK_PROPERTIES.slice(0, limit)
  } catch (error) {
    console.error('Error fetching popular properties:', error)
    return FALLBACK_PROPERTIES.slice(0, limit)
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
