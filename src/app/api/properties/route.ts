// @TASK P2-R1-T2 - Properties API - 목록 조회
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PropertyQueryParams, Property } from '@/types/property'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// Mock 데이터 (Supabase에 데이터 없을 때 사용)
const MOCK_PROPERTIES: Property[] = [
  {
    id: 'mock-1',
    name: '래미안 강남 포레스트',
    address: '서울시 강남구 역삼동 123',
    sido: '서울특별시',
    sigungu: '강남구',
    eupmyeondong: '역삼동',
    property_type: 'apt',
    price: 2850000000,
    area_exclusive: 84.5,
    floor: 18,
    total_floors: 35,
    building_name: '래미안 강남 포레스트',
    image_url: null,
    latitude: 37.5012,
    longitude: 127.0396,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-2',
    name: '아크로리버파크',
    address: '서울시 서초구 반포동 456',
    sido: '서울특별시',
    sigungu: '서초구',
    eupmyeondong: '반포동',
    property_type: 'apt',
    price: 4200000000,
    area_exclusive: 112.3,
    floor: 25,
    total_floors: 42,
    building_name: '아크로리버파크',
    image_url: null,
    latitude: 37.5085,
    longitude: 126.9962,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-3',
    name: '잠실 엘스',
    address: '서울시 송파구 잠실동 789',
    sido: '서울특별시',
    sigungu: '송파구',
    eupmyeondong: '잠실동',
    property_type: 'apt',
    price: 2100000000,
    area_exclusive: 84.9,
    floor: 12,
    total_floors: 28,
    building_name: '잠실 엘스',
    image_url: null,
    latitude: 37.5133,
    longitude: 127.0864,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-4',
    name: '힐스테이트 갤러리',
    address: '서울시 용산구 한남동 234',
    sido: '서울특별시',
    sigungu: '용산구',
    eupmyeondong: '한남동',
    property_type: 'apt',
    price: 3500000000,
    area_exclusive: 134.5,
    floor: 22,
    total_floors: 45,
    building_name: '힐스테이트 갤러리',
    image_url: null,
    latitude: 37.534,
    longitude: 127.0026,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-5',
    name: '마포 래미안 푸르지오',
    address: '서울시 마포구 아현동 567',
    sido: '서울특별시',
    sigungu: '마포구',
    eupmyeondong: '아현동',
    property_type: 'apt',
    price: 1580000000,
    area_exclusive: 59.9,
    floor: 8,
    total_floors: 25,
    building_name: '마포 래미안 푸르지오',
    image_url: null,
    latitude: 37.5512,
    longitude: 126.9567,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-6',
    name: '성수동 트리마제',
    address: '서울시 성동구 성수동 890',
    sido: '서울특별시',
    sigungu: '성동구',
    eupmyeondong: '성수동',
    property_type: 'apt',
    price: 1920000000,
    area_exclusive: 84.2,
    floor: 15,
    total_floors: 32,
    building_name: '트리마제',
    image_url: null,
    latitude: 37.5445,
    longitude: 127.0565,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-7',
    name: '반포 자이',
    address: '서울시 서초구 반포동 111',
    sido: '서울특별시',
    sigungu: '서초구',
    eupmyeondong: '반포동',
    property_type: 'apt',
    price: 3800000000,
    area_exclusive: 112.5,
    floor: 28,
    total_floors: 38,
    building_name: '반포 자이',
    image_url: null,
    latitude: 37.5082,
    longitude: 127.0112,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-8',
    name: '청담 아이파크',
    address: '서울시 강남구 청담동 222',
    sido: '서울특별시',
    sigungu: '강남구',
    eupmyeondong: '청담동',
    property_type: 'apt',
    price: 5200000000,
    area_exclusive: 165.3,
    floor: 32,
    total_floors: 40,
    building_name: '청담 아이파크',
    image_url: null,
    latitude: 37.5245,
    longitude: 127.0478,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-9',
    name: '동작 롯데캐슬',
    address: '서울시 동작구 사당동 333',
    sido: '서울특별시',
    sigungu: '동작구',
    eupmyeondong: '사당동',
    property_type: 'apt',
    price: 1250000000,
    area_exclusive: 59.5,
    floor: 10,
    total_floors: 22,
    building_name: '동작 롯데캐슬',
    image_url: null,
    latitude: 37.4912,
    longitude: 126.9678,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-10',
    name: '목동 하이페리온',
    address: '서울시 양천구 목동 444',
    sido: '서울특별시',
    sigungu: '양천구',
    eupmyeondong: '목동',
    property_type: 'apt',
    price: 1680000000,
    area_exclusive: 84.8,
    floor: 14,
    total_floors: 30,
    building_name: '목동 하이페리온',
    image_url: null,
    latitude: 37.5267,
    longitude: 126.8756,
    created_at: new Date().toISOString(),
  },
]

/**
 * GET /api/properties
 *
 * 매물 목록 조회 (필터, 페이지네이션)
 *
 * Query Parameters:
 * - q: 검색어 (이름, 주소 검색)
 * - region: 지역 ID (regions 테이블에서 sigungu 조회)
 * - sido: 시도 필터
 * - sigungu: 시군구 필터
 * - property_type: 매물 유형 (apt, officetel, villa, store, land, building)
 * - min_price: 최소 가격
 * - max_price: 최대 가격
 * - min_area: 최소 면적
 * - max_area: 최대 면적
 * - bounds: 지도 영역 (sw_lat,sw_lng,ne_lat,ne_lng)
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지 사이즈 (기본: 20, 최대: 100)
 * - sort: 정렬 (예: created_at:desc, area_exclusive:asc)
 *
 * Response:
 * { items: Property[], total: number, page: number, limit: number }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Query parameters 파싱
    const q = searchParams.get('q') || undefined
    const regionId = searchParams.get('region') || undefined
    const sido = searchParams.get('sido') || undefined
    let sigungu = searchParams.get('sigungu') || undefined
    const property_type = searchParams.get('property_type') || undefined
    const min_area = searchParams.get('min_area')
      ? parseFloat(searchParams.get('min_area')!)
      : undefined
    const max_area = searchParams.get('max_area')
      ? parseFloat(searchParams.get('max_area')!)
      : undefined
    const bounds = searchParams.get('bounds') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const sort = searchParams.get('sort') || 'created_at:desc'

    // region ID로 sigungu 조회
    if (regionId && !sigungu) {
      const { data: region } = await supabase
        .from('regions')
        .select('name, level')
        .eq('id', regionId)
        .single()

      if (region) {
        if (region.level === 2) {
          sigungu = region.name
        } else if (region.level === 3) {
          // 읍면동인 경우 eupmyeondong 검색은 별도 처리 필요
          sigungu = region.name
        }
      }
    }

    // 기본 쿼리 구성
    let query = supabase.from('properties').select('*', { count: 'exact' })

    // 텍스트 검색 (이름, 주소)
    if (q) {
      query = query.or(`name.ilike.%${q}%,address.ilike.%${q}%`)
    }

    // 필터 적용
    if (sido) query = query.eq('sido', sido)
    if (sigungu) query = query.eq('sigungu', sigungu)
    if (property_type) query = query.eq('property_type', property_type)
    if (min_area !== undefined) query = query.gte('area_exclusive', min_area)
    if (max_area !== undefined) query = query.lte('area_exclusive', max_area)

    // 정렬 처리
    const [sortField, sortOrder] = sort.split(':')
    query = query.order(sortField || 'created_at', {
      ascending: sortOrder === 'asc',
    })

    // 페이지네이션 (bounds가 있으면 limit만 적용)
    if (bounds) {
      query = query.limit(limit)
    } else {
      const offset = (page - 1) * limit
      query = query.range(offset, offset + limit - 1)
    }

    const { data, count, error } = await query

    if (error) {
      console.error('[Properties API] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // TODO: PostGIS 공간 쿼리를 위한 RPC 함수 필요
    // 현재는 location이 WKB 형식이라 JavaScript에서 bounds 필터링 불가
    // 지도에서는 모든 매물이 표시됨 (데이터가 적을 때만 허용)

    // 데이터가 없으면 Mock 데이터 반환
    if (!data || data.length === 0) {
      const mockData = MOCK_PROPERTIES.slice(0, limit)
      return NextResponse.json({
        items: mockData,
        total: MOCK_PROPERTIES.length,
        page,
        limit,
        isMock: true,
      })
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
