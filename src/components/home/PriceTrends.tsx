// @TASK P2-S1-T3 - 가격 트렌드 섹션
// @SPEC specs/screens/home.yaml#price_trends

import { createClient } from '@supabase/supabase-js'
import { PriceTrendsClient } from './PriceTrendsClient'
import type { RegionTrend } from '@/types/region'

async function fetchTrends(limit = 6): Promise<RegionTrend[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    )

    const { data, error } = await supabase
      .from('regions')
      .select('id, code, name, level, avg_price, price_change_weekly')
      .eq('level', 2)
      .not('avg_price', 'is', null)
      .order('avg_price', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      console.error('[PriceTrends] Supabase error:', error.message)
      return []
    }

    return (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      avg_price: r.avg_price,
      price_change_weekly: r.price_change_weekly,
      property_count: 0,
    }))
  } catch (err) {
    console.error('[PriceTrends] Error:', err)
    return []
  }
}

export async function PriceTrends() {
  const trends = await fetchTrends(6)

  return <PriceTrendsClient trends={trends} />
}
