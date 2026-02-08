/**
 * POST /api/commercial/business/compare
 *
 * 지역 비교 - 규칙 기반 예측으로 여러 지역 성공 확률 비교
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getSupabase,
  getDistrictName,
  fullName,
  fetchBusinessStats,
  fetchSalesStats,
  fetchStoreStats,
  fallbackPredict,
  num,
} from '../../_helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const districtCodes: string[] = body.district_codes || []
    const industryCode: string = body.industry_code || ''

    if (!districtCodes.length || !industryCode) {
      return NextResponse.json(
        { detail: 'district_codes, industry_code 필수' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const predictions: {
      district_code: string
      district_name: string
      success_probability: number
    }[] = []

    for (const dc of districtCodes) {
      const { name, sido } = await getDistrictName(supabase, dc)
      const dname = fullName(name, sido)

      const biz = await fetchBusinessStats(supabase, dc, industryCode)
      const sales = await fetchSalesStats(supabase, dc, industryCode)
      const stores = await fetchStoreStats(supabase, dc, industryCode)

      const feat = {
        survival_rate: biz.length ? num(biz[0].survival_rate, 75) : 75,
        monthly_avg_sales: sales.length
          ? num(sales[0].monthly_avg_sales, 40000000)
          : 40000000,
        sales_growth_rate: sales.length
          ? num(sales[0].sales_growth_rate, 3)
          : 3,
        store_count: stores.length ? num(stores[0].store_count, 120) : 120,
        franchise_ratio: stores.length
          ? num(stores[0].store_count, 1) > 0
            ? num(stores[0].franchise_count) / num(stores[0].store_count, 1)
            : 0.3
          : 0.3,
        competition_ratio: 1.2,
      }

      const result = fallbackPredict(feat)
      predictions.push({
        district_code: dc,
        district_name: dname,
        success_probability: result.success_probability,
      })
    }

    predictions.sort((a, b) => b.success_probability - a.success_probability)
    const comparisons = predictions.map((p, i) => ({
      ...p,
      ranking: i + 1,
    }))

    return NextResponse.json({ comparisons })
  } catch (err) {
    console.error('[Compare] Exception:', err)
    return NextResponse.json(
      { detail: '비교 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
