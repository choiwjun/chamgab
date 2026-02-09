// @TASK P6-LAND-T2 - Land Transactions API - list with aggregated stats
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

/** Allowed sort fields */
const VALID_SORT_FIELDS = [
  'transaction_date',
  'price',
  'price_per_m2',
  'area_m2',
  'created_at',
] as const

/**
 * Compute the exclusive upper-bound date for a YYYY-MM string.
 * e.g. "2025-12" -> "2026-01-01"
 */
function toDateExclusive(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

/**
 * GET /api/land/transactions
 *
 * Get land transaction list with summary statistics.
 *
 * Query Parameters:
 * - sido:           filter by sido
 * - sigungu:        filter by sigungu
 * - eupmyeondong:   filter by eupmyeondong
 * - land_category:  filter by land type (대, 전, 답, 임, 잡)
 * - from:           start date (YYYY-MM)
 * - to:             end date (YYYY-MM)
 * - page:           page number (default: 1)
 * - limit:          page size (default: 20, max: 100)
 * - sort:           field:direction (default: transaction_date:desc)
 *
 * Response:
 * {
 *   items: LandTransaction[],
 *   total: number,
 *   page: number,
 *   limit: number,
 *   stats: {
 *     avg_price_per_m2: number | null,
 *     total_count: number,
 *     total_area_m2: number | null,
 *     date_range: { from: string | null, to: string | null }
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams

    // -- Parse query parameters --
    const sido = searchParams.get('sido') || undefined
    const sigungu = searchParams.get('sigungu') || undefined
    const eupmyeondong = searchParams.get('eupmyeondong') || undefined
    const landCategory = searchParams.get('land_category') || undefined
    const fromDate = searchParams.get('from') || undefined
    const toDate = searchParams.get('to') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '20')),
      100
    )
    const sort = searchParams.get('sort') || 'transaction_date:desc'

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
          stats: null,
          error: `Invalid land_category. Must be one of: ${VALID_LAND_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // -- Validate date format --
    const dateRegex = /^\d{4}-\d{2}$/
    if (fromDate && !dateRegex.test(fromDate)) {
      return NextResponse.json(
        {
          items: [],
          total: 0,
          stats: null,
          error: 'Invalid from date format. Use YYYY-MM.',
        },
        { status: 400 }
      )
    }
    if (toDate && !dateRegex.test(toDate)) {
      return NextResponse.json(
        {
          items: [],
          total: 0,
          stats: null,
          error: 'Invalid to date format. Use YYYY-MM.',
        },
        { status: 400 }
      )
    }

    // -- Sanitize location inputs once --
    const sanitizedSigungu = sigungu ? sanitizeFilterInput(sigungu) : undefined
    const sanitizedEupmyeondong = eupmyeondong
      ? sanitizeFilterInput(eupmyeondong)
      : undefined

    // -- Main query: paginated list --
    let listQuery = supabase.from('land_transactions').select(
      `
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
        created_at
      `,
      { count: 'exact' }
    )

    // Shared filters for list query
    listQuery = listQuery.eq('is_cancelled', false)
    if (sido) listQuery = listQuery.eq('sido', sido)
    if (sanitizedSigungu) listQuery = listQuery.eq('sigungu', sanitizedSigungu)
    if (sanitizedEupmyeondong)
      listQuery = listQuery.eq('eupmyeondong', sanitizedEupmyeondong)
    if (landCategory) listQuery = listQuery.eq('land_category', landCategory)
    if (fromDate)
      listQuery = listQuery.gte('transaction_date', `${fromDate}-01`)
    if (toDate)
      listQuery = listQuery.lt('transaction_date', toDateExclusive(toDate))

    // Sort
    const [sortField, sortOrder] = sort.split(':')
    const validField = VALID_SORT_FIELDS.includes(
      sortField as (typeof VALID_SORT_FIELDS)[number]
    )
      ? sortField
      : 'transaction_date'
    listQuery = listQuery.order(validField, {
      ascending: sortOrder === 'asc',
    })

    // Pagination
    const offset = (page - 1) * limit
    listQuery = listQuery.range(offset, offset + limit - 1)

    // -- Stats query: aggregates over all matching rows --
    // Supabase JS client doesn't support SQL aggregation directly,
    // so we fetch price_per_m2 and area_m2 from the filtered set.
    // For large datasets a DB function would be better, but this
    // works at Stage 1 with reasonable data sizes.
    let statsQuery = supabase
      .from('land_transactions')
      .select('price_per_m2, area_m2, transaction_date', { count: 'exact' })

    // Same filters for stats query
    statsQuery = statsQuery.eq('is_cancelled', false)
    if (sido) statsQuery = statsQuery.eq('sido', sido)
    if (sanitizedSigungu)
      statsQuery = statsQuery.eq('sigungu', sanitizedSigungu)
    if (sanitizedEupmyeondong)
      statsQuery = statsQuery.eq('eupmyeondong', sanitizedEupmyeondong)
    if (landCategory) statsQuery = statsQuery.eq('land_category', landCategory)
    if (fromDate)
      statsQuery = statsQuery.gte('transaction_date', `${fromDate}-01`)
    if (toDate)
      statsQuery = statsQuery.lt('transaction_date', toDateExclusive(toDate))

    statsQuery = statsQuery
      .order('transaction_date', { ascending: true })
      .limit(10000) // safety cap for aggregation

    // -- Execute both queries in parallel --
    const [listResult, statsResult] = await Promise.all([listQuery, statsQuery])

    // -- Handle list errors --
    if (listResult.error) {
      console.error(
        '[Land Transactions API] Supabase list error:',
        listResult.error.message
      )
      return NextResponse.json(
        { items: [], total: 0, stats: null, error: 'Database error' },
        { status: 503 }
      )
    }

    // -- Compute stats from statsResult --
    let stats: {
      avg_price_per_m2: number | null
      total_count: number
      total_area_m2: number | null
      date_range: { from: string | null; to: string | null }
    } = {
      avg_price_per_m2: null,
      total_count: 0,
      total_area_m2: null,
      date_range: { from: null, to: null },
    }

    if (!statsResult.error && statsResult.data && statsResult.data.length > 0) {
      const rows = statsResult.data

      // Average price per m2
      const pricesPerM2 = rows
        .map((r) => Number(r.price_per_m2))
        .filter((v) => !isNaN(v) && v > 0)
      const avgPricePerM2 =
        pricesPerM2.length > 0
          ? Math.round(
              pricesPerM2.reduce((sum, v) => sum + v, 0) / pricesPerM2.length
            )
          : null

      // Total area
      const areas = rows
        .map((r) => Number(r.area_m2))
        .filter((v) => !isNaN(v) && v > 0)
      const totalArea =
        areas.length > 0
          ? Math.round(areas.reduce((sum, v) => sum + v, 0) * 100) / 100
          : null

      // Date range (rows are sorted ascending by transaction_date)
      const dates = rows
        .map((r) => r.transaction_date as string)
        .filter(Boolean)

      stats = {
        avg_price_per_m2: avgPricePerM2,
        total_count: statsResult.count || rows.length,
        total_area_m2: totalArea,
        date_range: {
          from: dates.length > 0 ? dates[0] : null,
          to: dates.length > 0 ? dates[dates.length - 1] : null,
        },
      }
    } else if (statsResult.error) {
      console.error(
        '[Land Transactions API] Supabase stats error:',
        statsResult.error.message
      )
      // Non-fatal: return items without stats
    }

    return NextResponse.json({
      items: listResult.data || [],
      total: listResult.count || 0,
      page,
      limit,
      stats,
    })
  } catch (err) {
    console.error('[Land Transactions API] Exception:', err)
    return NextResponse.json(
      { items: [], total: 0, stats: null, error: 'Database error' },
      { status: 503 }
    )
  }
}
