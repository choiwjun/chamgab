// @TASK Land Analysis Feature - Main land page
// @SPEC Land analysis home page with hero, regional stats, and recent transactions

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { LandHeroSection } from '@/components/land/LandHeroSection'
import { LandRegionTrends } from '@/components/land/LandRegionTrends'
import { LandRecentTransactions } from '@/components/land/LandRecentTransactions'
import type { LandRegionStats, LandTransaction } from '@/types/land'

async function fetchRegionalStats(limit = 6): Promise<LandRegionStats[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data, error } = await supabase.rpc('get_land_regional_stats', {
      limit_count: limit,
    })

    if (error) {
      console.error('[LandPage] Regional stats error:', error.message)
      return []
    }

    const stats = (data || []) as LandRegionStats[]
    if (stats.length === 0) return []

    const sigunguSet = new Set<string>()
    for (const stat of stats) {
      if (stat.sigungu) sigunguSet.add(stat.sigungu)
    }
    const sigungus = Array.from(sigunguSet)
    if (sigungus.length === 0) return stats

    const representativeBySigungu = new Map<string, string>()
    await Promise.all(
      sigungus.map(async (sigungu) => {
        const { data: parcelRows, error: parcelError } = await supabase
          .from('land_parcels')
          .select('pnu')
          .eq('sigungu', sigungu)
          .not('pnu', 'is', null)
          .order('latest_transaction_date', {
            ascending: false,
            nullsFirst: false,
          })
          .limit(1)

        if (parcelError) {
          console.error(
            '[LandPage] Representative pnu lookup error:',
            sigungu,
            parcelError.message
          )
          return
        }

        const pnu = parcelRows?.[0]?.pnu
        if (typeof pnu === 'string' && pnu.length > 0) {
          representativeBySigungu.set(sigungu, pnu)
        }
      })
    )

    return stats.map((stat) => ({
      ...stat,
      sample_pnu: representativeBySigungu.get(stat.sigungu) || null,
    }))
  } catch (err) {
    console.error('[LandPage] Regional stats fetch error:', err)
    return []
  }
}

async function fetchRecentTransactions(
  limit = 10,
  sigungu?: string
): Promise<LandTransaction[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

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
        created_at,
        land_parcels(pnu)
      `
    )

    query = query.eq('is_cancelled', false)
    if (sigungu) query = query.eq('sigungu', sigungu)

    const { data, error } = await query
      .order('transaction_date', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[LandPage] Recent transactions error:', error.message)
      return []
    }

    const rows =
      (data as Array<
        LandTransaction & { land_parcels?: { pnu?: string | null } | null }
      >) || []

    return rows.map((row) => ({
      ...row,
      pnu: row.land_parcels?.pnu ?? null,
    }))
  } catch (err) {
    console.error('[LandPage] Recent transactions fetch error:', err)
    return []
  }
}

export default async function LandPage({
  searchParams,
}: {
  searchParams?: { sigungu?: string }
}) {
  const sigungu =
    typeof searchParams?.sigungu === 'string'
      ? searchParams.sigungu.trim()
      : undefined

  const [regionalStats, recentTransactions] = await Promise.all([
    fetchRegionalStats(6),
    fetchRecentTransactions(10, sigungu),
  ])

  return (
    <main className="min-h-screen">
      <LandHeroSection />
      <LandRegionTrends stats={regionalStats} />
      <LandRecentTransactions transactions={recentTransactions} />
    </main>
  )
}
