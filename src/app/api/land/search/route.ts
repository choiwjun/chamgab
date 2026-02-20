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
    const q = searchParams.get('q') || undefined
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
    const sort = searchParams.get('sort') || 'created_at:desc'

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
    let query = supabase.from('land_transactions').select(
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
    const [sortField, sortOrder] = sort.split(':')
    const validField = VALID_SORT_FIELDS.includes(
      sortField as (typeof VALID_SORT_FIELDS)[number]
    )
      ? sortField
      : 'created_at'
    query = query.order(validField, {
      ascending: sortOrder === 'asc',
    })

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

    return NextResponse.json({
      items: data || [],
      total: count || 0,
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
