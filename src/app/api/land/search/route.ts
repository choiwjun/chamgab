// @TASK P6-LAND-T1 - Land Search API - parcel/transaction search
// @SPEC docs/planning/02-trd.md#land-analysis

// Dynamic rendering forced (Supabase queries)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeFilterInput } from '@/lib/sanitize'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Allowed land category values */
const VALID_LAND_CATEGORIES = ['대', '전', '답', '임', '잡'] as const

/** Allowed sort fields and directions */
const VALID_SORT_FIELDS = [
  'created_at',
  'price_per_m2',
  'area_m2',
  'transaction_date',
  'price',
] as const

/**
 * GET /api/land/search
 *
 * Search land transactions with text, location, and category filters.
 *
 * At Stage 1 this queries land_transactions directly. When land_parcels
 * are populated later the route can be extended to join parcels for
 * richer results.
 *
 * Query Parameters:
 * - q:              text search (jibun, eupmyeondong)
 * - sido:           filter by sido
 * - sigungu:        filter by sigungu
 * - land_category:  filter by land type (대, 전, 답, 임, 잡)
 * - min_area:       minimum area in m2
 * - max_area:       maximum area in m2
 * - page:           page number (default: 1)
 * - limit:          page size (default: 20, max: 100)
 * - sort:           field:direction (default: created_at:desc)
 *
 * Response:
 * { items: LandTransaction[], total: number, page: number, limit: number }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams

    // -- Parse query parameters --
    const q = searchParams.get('q') || searchParams.get('query') || undefined
    const quickLookup =
      searchParams.get('quick') === '1' || searchParams.get('quick') === 'true'
    const sido = searchParams.get('sido') || undefined
    const sigungu = searchParams.get('sigungu') || undefined
    const landCategory = searchParams.get('land_category') || undefined
    const minArea = searchParams.get('min_area')
      ? parseFloat(searchParams.get('min_area')!)
      : undefined
    const maxArea = searchParams.get('max_area')
      ? parseFloat(searchParams.get('max_area')!)
      : undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '20')),
      100
    )
    const sortParam = searchParams.get('sort')
    const sortRaw = (sortParam || 'created_at:desc').trim()
    const orderRaw = (searchParams.get('order') || '').trim()

    if (quickLookup) {
      const sanitizedQ = q ? sanitizeFilterInput(q) : ''
      if (!sanitizedQ) {
        return NextResponse.json(
          { items: [], transactions: [], total: 0, page: 1, limit },
          { status: 200 }
        )
      }

      let quickQuery = supabase
        .from('land_parcels')
        .select(
          'id,pnu,sido,sigungu,eupmyeondong,jibun,latest_transaction_date'
        )
        .or(
          `pnu.ilike.%${sanitizedQ}%,jibun.ilike.%${sanitizedQ}%,eupmyeondong.ilike.%${sanitizedQ}%,sigungu.ilike.%${sanitizedQ}%,sido.ilike.%${sanitizedQ}%`
        )
        .order('latest_transaction_date', {
          ascending: false,
          nullsFirst: false,
        })
        .limit(limit)

      if (sido) quickQuery = quickQuery.eq('sido', sido)
      if (sigungu) {
        const sanitizedSigungu = sanitizeFilterInput(sigungu)
        if (sanitizedSigungu)
          quickQuery = quickQuery.eq('sigungu', sanitizedSigungu)
      }

      const { data: quickRows, error: quickError } = await quickQuery
      if (quickError) {
        console.error(
          '[Land Search API] Quick lookup error:',
          quickError.message
        )
        return NextResponse.json(
          { items: [], total: 0, error: 'Database error' },
          { status: 503 }
        )
      }

      const items =
        (quickRows || []).map((row) => ({
          pnu: row.pnu,
          parcel_id: row.id,
          sido: row.sido,
          sigungu: row.sigungu,
          eupmyeondong: row.eupmyeondong,
          jibun: row.jibun,
        })) || []

      return NextResponse.json({
        items,
        transactions: items,
        total: items.length,
        page: 1,
        limit,
      })
    }

    // -- Validate land_category --
    if (
      landCategory &&
      !VALID_LAND_CATEGORIES.includes(
        landCategory as (typeof VALID_LAND_CATEGORIES)[number]
      )
    ) {
      return NextResponse.json(
        {
          items: [],
          total: 0,
          error: `Invalid land_category. Must be one of: ${VALID_LAND_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // -- Build query --
    const selectColumns = `
        id,
        parcel_id,
        sido,
        sigungu,
        eupmyeondong,
        jibun,
        land_category,
        area_m2,
        price,
        price_per_m2,
        transaction_date,
        transaction_type,
        is_partial_sale,
        is_cancelled,
        created_at,
        land_parcels(pnu)
      `

    let query = q
      ? supabase.from('land_transactions').select(selectColumns)
      : supabase
          .from('land_transactions')
          .select(selectColumns, { count: 'exact' })

    // Exclude cancelled transactions by default
    query = query.eq('is_cancelled', false)

    // -- Text search (jibun, eupmyeondong) --
    if (q) {
      const sanitizedQ = sanitizeFilterInput(q)
      if (sanitizedQ) {
        query = query.or(
          `jibun.ilike.%${sanitizedQ}%,eupmyeondong.ilike.%${sanitizedQ}%,sigungu.ilike.%${sanitizedQ}%,sido.ilike.%${sanitizedQ}%`
        )
      }
    }

    // -- Location filters --
    if (sido) {
      query = query.eq('sido', sido)
    }
    if (sigungu) {
      const sanitizedSigungu = sanitizeFilterInput(sigungu)
      if (sanitizedSigungu) {
        query = query.eq('sigungu', sanitizedSigungu)
      }
    }

    // -- Land category filter --
    if (landCategory) {
      query = query.eq('land_category', landCategory)
    }

    // -- Area range filter --
    if (minArea !== undefined && !isNaN(minArea)) {
      query = query.gte('area_m2', minArea)
    }
    if (maxArea !== undefined && !isNaN(maxArea)) {
      query = query.lte('area_m2', maxArea)
    }

    // -- Sort --
    let rawSortField = sortRaw
    let rawSortOrderFromSort = ''
    if (sortRaw.includes(':')) {
      const parts = sortRaw.split(':')
      rawSortField = parts[0] || 'created_at'
      rawSortOrderFromSort = parts[1] || ''
    }
    const sortOrder = (rawSortOrderFromSort || orderRaw || 'desc').toLowerCase()
    const validField = VALID_SORT_FIELDS.includes(
      rawSortField as (typeof VALID_SORT_FIELDS)[number]
    )
      ? rawSortField
      : 'created_at'
    if (!q || sortParam) {
      query = query.order(validField, {
        ascending: sortOrder === 'asc',
      })
    }

    // -- Pagination --
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    // -- Execute --
    const { data, count, error } = await query

    if (error) {
      console.error('[Land Search API] Supabase error:', error.message)
      return NextResponse.json(
        { items: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    const items =
      (
        data as Array<{
          land_parcels?: { pnu?: string | null } | null
          [key: string]: unknown
        }> | null
      )?.map((row) => ({
        ...row,
        pnu: row.land_parcels?.pnu ?? null,
      })) || []

    return NextResponse.json({
      items,
      transactions: items,
      total: typeof count === 'number' ? count : items.length,
      page,
      limit,
    })
  } catch (err) {
    console.error('[Land Search API] Exception:', err)
    return NextResponse.json(
      { items: [], total: 0, error: 'Database error' },
      { status: 503 }
    )
  }
}
