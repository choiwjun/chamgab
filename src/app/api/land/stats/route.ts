// @TASK P6-LAND-T3 - Land Stats API - regional price statistics
// @SPEC docs/planning/02-trd.md#land-analysis

// Dynamic rendering forced (Supabase queries)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Allowed land category values */
const VALID_LAND_CATEGORIES = ['대', '전', '답', '임', '잡'] as const

interface RegionLandStat {
  region: string
  avg_price_per_m2: number
  transaction_count: number
  price_change_pct: number | null
}

/**
 * GET /api/land/stats
 *
 * Get regional land price statistics by aggregating land_transactions.
 *
 * Query Parameters:
 * - level:          1 (sido) or 2 (sigungu). Default: 2
 * - limit:          max regions to return. Default: 20, max: 100
 * - land_category:  filter by land type (대, 전, 답, 임, 잡)
 *
 * Response:
 * {
 *   items: RegionLandStat[],
 *   metadata: { level, limit, land_category, count }
 * }
 *
 * Each RegionLandStat:
 * - region:             region name (sido or sigungu)
 * - avg_price_per_m2:   average price per m2 in won
 * - transaction_count:  number of transactions
 * - price_change_pct:   % change comparing recent 6 months to previous 6 months
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams

    // -- Parse query parameters --
    const level = parseInt(searchParams.get('level') || '2')
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get('limit') || '20')),
      100
    )
    const landCategory = searchParams.get('land_category') || undefined

    // -- Validate --
    if (![1, 2].includes(level)) {
      return NextResponse.json(
        { items: [], metadata: {}, error: 'Invalid level. Must be 1 or 2.' },
        { status: 400 }
      )
    }

    if (
      landCategory &&
      !VALID_LAND_CATEGORIES.includes(
        landCategory as (typeof VALID_LAND_CATEGORIES)[number]
      )
    ) {
      return NextResponse.json(
        {
          items: [],
          metadata: {},
          error: `Invalid land_category. Must be one of: ${VALID_LAND_CATEGORIES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Determine the region column based on level
    const regionColumn = level === 1 ? 'sido' : 'sigungu'

    // -- Compute the 6-month boundary dates --
    // "Recent" = last 6 months from now, "Previous" = 6 months before that
    const now = new Date()
    const recentStart = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 12, 1)

    const formatDate = (d: Date): string => {
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }

    const recentStartStr = formatDate(recentStart)
    const previousStartStr = formatDate(previousStart)
    const nowStr = formatDate(now)

    // -- Fetch all relevant transactions (recent 12 months, non-cancelled) --
    // We fetch enough data to compute per-region stats.
    // For very large datasets, this should move to a DB function.
    // Always select both sido and sigungu to avoid TS union type issues
    // with dynamic column access. We pick the right one at aggregation time.
    let query = supabase
      .from('land_transactions')
      .select('sido, sigungu, price_per_m2, area_m2, transaction_date')
      .eq('is_cancelled', false)
      .gte('transaction_date', previousStartStr)
      .lte('transaction_date', nowStr)
      .not('price_per_m2', 'is', null)

    if (landCategory) {
      query = query.eq('land_category', landCategory)
    }

    // Fetch up to 50,000 rows (safety cap)
    query = query.limit(50000)

    const { data, error } = await query

    if (error) {
      console.error('[Land Stats API] Supabase error:', error.message)
      return NextResponse.json(
        { items: [], metadata: {}, error: 'Database error' },
        { status: 503 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        items: [],
        metadata: {
          level,
          limit,
          land_category: landCategory || null,
          count: 0,
        },
      })
    }

    // -- Aggregate per region --
    interface RegionBucket {
      recentPrices: number[]
      previousPrices: number[]
      allPrices: number[]
      count: number
    }

    const regionMap = new Map<string, RegionBucket>()

    for (const row of data) {
      const region = (level === 1 ? row.sido : row.sigungu) as string
      if (!region) continue

      const pricePerM2 = Number(row.price_per_m2)
      if (isNaN(pricePerM2) || pricePerM2 <= 0) continue

      if (!regionMap.has(region)) {
        regionMap.set(region, {
          recentPrices: [],
          previousPrices: [],
          allPrices: [],
          count: 0,
        })
      }

      const bucket = regionMap.get(region)!
      bucket.allPrices.push(pricePerM2)
      bucket.count++

      // Classify into recent vs previous period
      const txDate = row.transaction_date as string
      if (txDate >= recentStartStr) {
        bucket.recentPrices.push(pricePerM2)
      } else {
        bucket.previousPrices.push(pricePerM2)
      }
    }

    // -- Build result items --
    const items: RegionLandStat[] = []
    const regionEntries = Array.from(regionMap.entries())

    for (const [region, bucket] of regionEntries) {
      const avgPricePerM2 =
        bucket.allPrices.length > 0
          ? Math.round(
              bucket.allPrices.reduce((s, v) => s + v, 0) /
                bucket.allPrices.length
            )
          : 0

      // Price change: (recent avg - previous avg) / previous avg * 100
      let priceChangePct: number | null = null
      if (bucket.recentPrices.length > 0 && bucket.previousPrices.length > 0) {
        const recentAvg =
          bucket.recentPrices.reduce((s, v) => s + v, 0) /
          bucket.recentPrices.length
        const previousAvg =
          bucket.previousPrices.reduce((s, v) => s + v, 0) /
          bucket.previousPrices.length

        if (previousAvg > 0) {
          priceChangePct =
            Math.round(((recentAvg - previousAvg) / previousAvg) * 10000) / 100
        }
      }

      items.push({
        region,
        avg_price_per_m2: avgPricePerM2,
        transaction_count: bucket.count,
        price_change_pct: priceChangePct,
      })
    }

    // -- Sort by transaction count descending (most active regions first) --
    items.sort((a, b) => b.transaction_count - a.transaction_count)

    // -- Apply limit --
    const limitedItems = items.slice(0, limit)

    return NextResponse.json({
      items: limitedItems,
      metadata: {
        level,
        limit,
        land_category: landCategory || null,
        count: limitedItems.length,
        total_regions: items.length,
      },
    })
  } catch (err) {
    console.error('[Land Stats API] Exception:', err)
    return NextResponse.json(
      { items: [], metadata: {}, error: 'Database error' },
      { status: 503 }
    )
  }
}
