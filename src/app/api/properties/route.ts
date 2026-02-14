// @TASK P2-R1-T2 - Properties API - 목록 조회
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { REGION_COORDS, expandCityToDistricts } from '@/lib/region-coords'
import { sanitizeFilterInput } from '@/lib/sanitize'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

interface RegionFilters {
  sido?: string
  sigungu?: string
}

async function resolveRegionFilters(
  supabase: ReturnType<typeof getSupabase>,
  regionId?: string
): Promise<RegionFilters> {
  if (!regionId) return {}

  const { data: region } = await supabase
    .from('regions')
    .select('name, level, parent_code')
    .eq('id', regionId)
    .maybeSingle()

  if (!region) return {}

  if (region.level === 1) {
    return { sido: region.name }
  }

  if (region.level === 2) {
    let sido: string | undefined
    if (region.parent_code) {
      const { data: parent } = await supabase
        .from('regions')
        .select('name')
        .eq('code', region.parent_code)
        .maybeSingle()
      sido = parent?.name
    }
    return { sido, sigungu: region.name }
  }

  if (region.level === 3 && region.parent_code) {
    const { data: sigunguRegion } = await supabase
      .from('regions')
      .select('name, parent_code')
      .eq('code', region.parent_code)
      .maybeSingle()

    let sido: string | undefined
    if (sigunguRegion?.parent_code) {
      const { data: sidoRegion } = await supabase
        .from('regions')
        .select('name')
        .eq('code', sigunguRegion.parent_code)
        .maybeSingle()
      sido = sidoRegion?.name
    }

    return { sido, sigungu: sigunguRegion?.name }
  }

  return {}
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
    let sido = searchParams.get('sido') || undefined
    let sigungu = searchParams.get('sigungu') || undefined
    const property_type = searchParams.get('property_type') || undefined
    const min_price = searchParams.get('min_price')
      ? parseFloat(searchParams.get('min_price')!)
      : undefined
    const max_price = searchParams.get('max_price')
      ? parseFloat(searchParams.get('max_price')!)
      : undefined
    const min_area = searchParams.get('min_area')
      ? parseFloat(searchParams.get('min_area')!)
      : undefined
    const max_area = searchParams.get('max_area')
      ? parseFloat(searchParams.get('max_area')!)
      : undefined
    const bounds = searchParams.get('bounds') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const sort = searchParams.get('sort') || 'created_at:desc'
    const nowIso = new Date().toISOString()

    // region ID로 시도/시군구 조회
    if (regionId && (!sido || !sigungu)) {
      const resolved = await resolveRegionFilters(supabase, regionId)
      if (!sido && resolved.sido) sido = resolved.sido
      if (!sigungu && resolved.sigungu) sigungu = resolved.sigungu
    }

    const hasPriceFilter =
      (min_price !== undefined && !Number.isNaN(min_price)) ||
      (max_price !== undefined && !Number.isNaN(max_price))

    // 기본 쿼리 구성
    const SELECT_WITH_ANALYSIS =
      '*,chamgab_analyses(chamgab_price,min_price,max_price,confidence,analyzed_at,expires_at)' as const

    // supabase-js select string parser is type-level; keep literals in-branch.
    // Use `any` for the query builder to avoid leaking ParserError types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any
    if (hasPriceFilter) {
      query = supabase
        .from('properties')
        .select(SELECT_WITH_ANALYSIS, { count: 'exact' })
    } else {
      query = supabase.from('properties').select('*', { count: 'exact' })
    }

    // 텍스트 검색 (이름, 주소, 시군구, 시도 + 시→구 확장)
    if (q) {
      // PostgREST filter injection 방지: 특수문자 제거
      const sanitizedQ = sanitizeFilterInput(q)
      if (sanitizedQ) {
        // 기본: 이름, 주소, 시군구, 시도에서 검색
        let searchFilters = `name.ilike.%${sanitizedQ}%,address.ilike.%${sanitizedQ}%,sigungu.ilike.%${sanitizedQ}%,sido.ilike.%${sanitizedQ}%`

        // 시→구 확장: "안산" → 단원구, 상록구 등 하위 구 매물도 포함
        // expandCityToDistricts returns internal data (safe), but sanitize for consistency
        const expandedDistricts = expandCityToDistricts(sanitizedQ)
        if (expandedDistricts.length > 0) {
          const districtFilters = expandedDistricts
            .map((d) => `sigungu.eq.${sanitizeFilterInput(d)}`)
            .join(',')
          searchFilters += `,${districtFilters}`
        }

        query = query.or(searchFilters)
      }
    }

    // 필터 적용
    if (sido) query = query.eq('sido', sido)
    if (sigungu) {
      // 선택 필터는 정확 매칭으로 처리 (검색어 조건과 충돌 방지)
      const sanitizedSigungu = sanitizeFilterInput(sigungu)
      if (sanitizedSigungu) {
        query = query.eq('sigungu', sanitizedSigungu)
      }
    }
    if (property_type) query = query.eq('property_type', property_type)
    if (min_area !== undefined) query = query.gte('area_exclusive', min_area)
    if (max_area !== undefined) query = query.lte('area_exclusive', max_area)

    // 가격 필터: properties 테이블에 price가 없으므로, 유효한 참값 분석 결과(chamgab_analyses) 기준으로 필터링
    if (hasPriceFilter) {
      query = query.gt('chamgab_analyses.expires_at', nowIso)
      if (min_price !== undefined && !Number.isNaN(min_price)) {
        query = query.gte('chamgab_analyses.chamgab_price', min_price)
      }
      if (max_price !== undefined && !Number.isNaN(max_price)) {
        query = query.lte('chamgab_analyses.chamgab_price', max_price)
      }
    }

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
    // location이 NULL이면 시군구 기반 근사 좌표 부여 (±400m jitter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (data || []).map((item: any) => {
      const parsed = parseWKBPoint(item.location)
      if (parsed) return { ...item, location: parsed }

      // PostGIS 좌표가 없으면 시군구 중심 좌표 + jitter
      const regionCenter = REGION_COORDS[item.sigungu || '']
      if (regionCenter) {
        return {
          ...item,
          location: {
            lat: regionCenter.lat + (Math.random() - 0.5) * 0.008,
            lng: regionCenter.lng + (Math.random() - 0.5) * 0.008,
          },
        }
      }

      return { ...item, location: null }
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
