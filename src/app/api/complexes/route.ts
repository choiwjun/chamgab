// @TASK P2-R0-T1 - Complexes API - 목록 조회
// @SPEC specs/domain/resources.yaml#complexes

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'
import { getComplexes, getComplexesByBrand } from '@/services/complexes'
import { REGION_COORDS } from '@/lib/region-coords'
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

function deterministicJitter(seed: string, scale: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const normalized = (Math.abs(hash) % 10000) / 10000
  return (normalized - 0.5) * scale
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
 * GET /api/complexes
 *
 * 아파트 단지 목록 조회
 *
 * Query Parameters:
 * - sido: 시도 필터 (예: 서울시)
 * - sigungu: 시군구 필터 (예: 강남구)
 * - brand: 브랜드 필터 (예: 래미안, 자이)
 * - keyword: 단지명 검색
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지 사이즈 (기본: 20, 최대: 100)
 *
 * Response:
 * {
 *   items: Complex[],
 *   total: number,
 *   page: number,
 *   limit: number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const mapMode = searchParams.get('map') === 'true'

    // 지도 모드: 경량 데이터 (id, name, sigungu, location) 최대 500건
    if (mapMode) {
      return handleMapMode(searchParams, supabase)
    }

    // Query parameters 파싱
    let sido = searchParams.get('sido') || undefined
    let sigungu = searchParams.get('sigungu') || undefined
    const region = searchParams.get('region') || undefined
    const brand = searchParams.get('brand') || undefined
    const keyword = searchParams.get('keyword') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20'))
    )

    if (region && (!sido || !sigungu)) {
      const resolved = await resolveRegionFilters(supabase, region)
      if (!sido && resolved.sido) sido = resolved.sido
      if (!sigungu && resolved.sigungu) sigungu = resolved.sigungu
    }

    // 브랜드 필터가 있으면 브랜드 전용 조회
    if (brand && !sido && !sigungu && !keyword && !region) {
      const result = await getComplexesByBrand(brand, page, limit)
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      })
    }

    // 일반 조회
    const result = await getComplexes({
      sido,
      sigungu,
      keyword,
      page,
      limit,
    })

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    })
  } catch (error) {
    console.error('[Complexes API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/** 지도 모드: 경량 단지 데이터 반환 (최대 500건) */
async function handleMapMode(
  searchParams: URLSearchParams,
  supabase: ReturnType<typeof getSupabase>
) {
  const keyword = searchParams.get('keyword') || undefined
  let sigungu = searchParams.get('sigungu') || undefined
  let sido = searchParams.get('sido') || undefined
  const region = searchParams.get('region') || undefined

  if (region && (!sido || !sigungu)) {
    const resolved = await resolveRegionFilters(supabase, region)
    if (!sido && resolved.sido) sido = resolved.sido
    if (!sigungu && resolved.sigungu) sigungu = resolved.sigungu
  }

  let query = supabase
    .from('complexes')
    .select('id, name, address, sigungu, location, built_year, total_units', {
      count: 'exact',
    })

  if (keyword) {
    const sanitizedKeyword = sanitizeFilterInput(keyword)
    if (sanitizedKeyword) {
      query = query.or(
        `name.ilike.%${sanitizedKeyword}%,sigungu.ilike.%${sanitizedKeyword}%,address.ilike.%${sanitizedKeyword}%`
      )
    }
  }
  if (sigungu) {
    const sanitizedSigungu = sanitizeFilterInput(sigungu)
    if (sanitizedSigungu) {
      query = query.eq('sigungu', sanitizedSigungu)
    }
  }
  if (sido) {
    query = query.eq('sido', sido)
  }

  query = query.order('name', { ascending: true }).limit(500)

  const { data, count, error } = await query

  if (error) {
    console.error('[Complexes API] Map mode error:', error.message)
    return NextResponse.json({ items: [], total: 0 }, { status: 503 })
  }

  const items = (data || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => {
      let location = null
      if (
        r.location &&
        typeof r.location === 'object' &&
        r.location.coordinates
      ) {
        location = {
          lng: r.location.coordinates[0],
          lat: r.location.coordinates[1],
        }
      }
      if (!location) {
        const center = REGION_COORDS[r.sigungu || '']
        if (center) {
          location = {
            lat: center.lat + deterministicJitter(`${r.id}:lat`, 0.006),
            lng: center.lng + deterministicJitter(`${r.id}:lng`, 0.006),
          }
        }
      }
      return {
        id: r.id,
        name: r.name,
        address: r.address || '',
        sigungu: r.sigungu,
        location,
        built_year: r.built_year,
        total_units: r.total_units,
      }
    })
    .filter((r: { location: unknown }) => r.location !== null)

  return NextResponse.json(
    { items, total: count || 0 },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }
  )
}
