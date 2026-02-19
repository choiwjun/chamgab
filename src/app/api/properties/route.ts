// @TASK P2-R1-T2 - Properties API - 紐⑸줉 議고쉶
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

// ?숈쟻 ?뚮뜑留?媛뺤젣 (Supabase ?ъ슜)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { REGION_COORDS, expandCityToDistricts } from '@/lib/region-coords'
import { buildSearchTerms, sanitizeFilterInput } from '@/lib/sanitize'

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
 * PostGIS WKB hex瑜?lat/lng 媛앹껜濡??뚯떛
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
 * 留ㅻЪ 紐⑸줉 議고쉶 (?꾪꽣, ?섏씠吏?ㅼ씠??
 *
 * Query Parameters:
 * - q: 寃?됱뼱 (?대쫫, 二쇱냼 寃??
 * - region: 吏??ID (regions ?뚯씠釉붿뿉??sigungu 議고쉶)
 * - sido: ?쒕룄 ?꾪꽣
 * - sigungu: ?쒓뎔援??꾪꽣
 * - property_type: 留ㅻЪ ?좏삎 (apt, officetel, villa, store, land, building)
 * - min_price: 理쒖냼 媛寃? * - max_price: 理쒕? 媛寃? * - min_area: 理쒖냼 硫댁쟻
 * - max_area: 理쒕? 硫댁쟻
 * - bounds: 吏???곸뿭 (sw_lat,sw_lng,ne_lat,ne_lng)
 * - page: ?섏씠吏 踰덊샇 (湲곕낯: 1)
 * - limit: ?섏씠吏 ?ъ씠利?(湲곕낯: 20, 理쒕?: 100)
 * - sort: ?뺣젹 (?? created_at:desc, area_exclusive:asc)
 *
 * Response:
 * { items: Property[], total: number, page: number, limit: number }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams

    // Query parameters ?뚯떛
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

    // region ID濡??쒕룄/?쒓뎔援?議고쉶
    if (regionId && (!sido || !sigungu)) {
      const resolved = await resolveRegionFilters(supabase, regionId)
      if (!sido && resolved.sido) sido = resolved.sido
      if (!sigungu && resolved.sigungu) sigungu = resolved.sigungu
    }

    const hasPriceFilter =
      (min_price !== undefined && !Number.isNaN(min_price)) ||
      (max_price !== undefined && !Number.isNaN(max_price))

    // 湲곕낯 荑쇰━ 援ъ꽦
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

    // ?띿뒪??寃??(?대쫫, 二쇱냼, ?쒓뎔援? ?쒕룄 + ?쒋넂援??뺤옣)
    if (q) {
      const terms = buildSearchTerms(q, 5)
      if (terms.length > 0) {
        const filtersByTerm = terms.flatMap((term) => [
          `name.ilike.%${term}%`,
          `address.ilike.%${term}%`,
          `sigungu.ilike.%${term}%`,
          `sido.ilike.%${term}%`,
        ])

        const expandedDistricts = new Set<string>()
        for (const term of terms) {
          for (const district of expandCityToDistricts(term)) {
            const safeDistrict = sanitizeFilterInput(district)
            if (safeDistrict) expandedDistricts.add(safeDistrict)
          }
        }

        expandedDistricts.forEach((district) => {
          filtersByTerm.push(`sigungu.eq.${district}`)
        })

        query = query.or(filtersByTerm.join(','))
      }
    }

    // ?꾪꽣 ?곸슜
    if (sido) query = query.eq('sido', sido)
    if (sigungu) {
      // ?좏깮 ?꾪꽣???뺥솗 留ㅼ묶?쇰줈 泥섎━ (寃?됱뼱 議곌굔怨?異⑸룎 諛⑹?)
      const sanitizedSigungu = sanitizeFilterInput(sigungu)
      if (sanitizedSigungu) {
        query = query.eq('sigungu', sanitizedSigungu)
      }
    }
    if (property_type) query = query.eq('property_type', property_type)
    if (min_area !== undefined) query = query.gte('area_exclusive', min_area)
    if (max_area !== undefined) query = query.lte('area_exclusive', max_area)

    // 가격 필터는 유효한 최근 chamgab 분석 기준으로 적용
    if (hasPriceFilter) {
      query = query.gt('chamgab_analyses.expires_at', nowIso)
      if (min_price !== undefined && !Number.isNaN(min_price)) {
        query = query.gte('chamgab_analyses.chamgab_price', min_price)
      }
      if (max_price !== undefined && !Number.isNaN(max_price)) {
        query = query.lte('chamgab_analyses.chamgab_price', max_price)
      }
    }

    // ?뺣젹 泥섎━
    const [sortField, sortOrder] = sort.split(':')
    query = query.order(sortField || 'created_at', {
      ascending: sortOrder === 'asc',
    })

    // ?섏씠吏?ㅼ씠??(bounds媛 ?덉쑝硫?limit留??곸슜)
    if (bounds) {
      query = query.limit(limit)
    } else {
      const offset = (page - 1) * limit
      query = query.range(offset, offset + limit - 1)
    }

    const { data, count, error } = await query

    // Supabase ?먮윭 泥섎━
    if (error) {
      console.error('[Properties API] Supabase error:', error.message)
      return NextResponse.json(
        { items: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    // location WKB hex ??{ lat, lng } 蹂??    // location??NULL?대㈃ ?쒓뎔援?湲곕컲 洹쇱궗 醫뚰몴 遺??(짹400m jitter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (data || []).map((item: any) => {
      const parsed = parseWKBPoint(item.location)
      if (parsed) return { ...item, location: parsed }

      // PostGIS 醫뚰몴媛 ?놁쑝硫??쒓뎔援?以묒떖 醫뚰몴 + jitter
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
    // ?덉쇅 諛쒖깮 ???먮윭 ?묐떟
    console.error('[Properties API] Exception:', err)
    return NextResponse.json(
      { items: [], total: 0, error: 'Database error' },
      { status: 503 }
    )
  }
}
