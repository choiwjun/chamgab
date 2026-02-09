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

    return data || []
  } catch (err) {
    console.error('[LandPage] Regional stats fetch error:', err)
    return []
  }
}

async function fetchRecentTransactions(limit = 10): Promise<LandTransaction[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data, error } = await supabase
      .from('land_transactions')
      .select('*')
      .eq('is_cancelled', false)
      .order('transaction_date', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[LandPage] Recent transactions error:', error.message)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[LandPage] Recent transactions fetch error:', err)
    return []
  }
}

export default async function LandPage() {
  const [regionalStats, recentTransactions] = await Promise.all([
    fetchRegionalStats(6),
    fetchRecentTransactions(10),
  ])

  return (
    <main className="min-h-screen">
      <LandHeroSection />
      <LandRegionTrends stats={regionalStats} />
      <LandRecentTransactions transactions={recentTransactions} />
    </main>
  )
}
