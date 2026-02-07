// @TASK P2-R1-T2 - Properties API - 목록 조회
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/**
 * PostGIS WKB hex를 lat/lng 객체로 파싱
 * WKB Point with SRID 4326: 0101000020E6100000 + X(8bytes LE) + Y(8bytes LE)
 */
function parseWKBPoint(wkb: string): { lat: number; lng: number } | null {
  if (!wkb || typeof wkb !== 'string' || wkb.length < 50) return null

  try {
    const xHex = wkb.substring(wkb.length - 32, wkb.length - 16)
    const yHex = wkb.substring(wkb.length - 16)

    const xBuf = Buffer.from(xHex, 'hex')
    const yBuf = Buffer.from(yHex, 'hex')

    const lng = xBuf.readDoubleLE(0)
    const lat = yBuf.readDoubleLE(0)

    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng }
    }
    return null
  } catch {
    return null
  }
}

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
    const supabase = getSupabase()
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
    if (sigungu) {
      // sigungu 정확 매칭 또는 address에 지역명 포함 검색
      query = query.or(`sigungu.eq.${sigungu},address.ilike.%${sigungu}%`)
    }
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

    // Supabase 에러 처리
    if (error) {
      console.error('[Properties API] Supabase error:', error.message)
      return NextResponse.json(
        { items: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    // location WKB hex → { lat, lng } 변환
    const items = (data || []).map((item) => {
      const parsed = parseWKBPoint(item.location)
      return {
        ...item,
        location: parsed || item.location,
      }
    })

    return NextResponse.json({
      items,
      total: count || 0,
      page,
      limit,
    })
  } catch (err) {
    // 예외 발생 시 에러 응답
    console.error('[Properties API] Exception:', err)
    return NextResponse.json(
      { items: [], total: 0, error: 'Database error' },
      { status: 503 }
    )
  }
}
