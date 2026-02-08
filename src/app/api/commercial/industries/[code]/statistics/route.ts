/**
 * GET /api/commercial/industries/[code]/statistics
 *
 * 업종 통계 조회 - Supabase 실데이터
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
  avg,
} from '../../../_helpers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '5', 10)

    const supabase = getSupabase()

    const { data: bizAll } = await supabase
      .from('business_statistics')
      .select('*')
      .eq('industry_small_code', code)

    const { data: salesAll } = await supabase
      .from('sales_statistics')
      .select('*')
      .eq('industry_small_code', code)

    const { data: storeAll } = await supabase
      .from('store_statistics')
      .select('*')
      .eq('industry_small_code', code)

    if (!bizAll || bizAll.length === 0) {
      return NextResponse.json(
        { detail: `업종을 찾을 수 없습니다: ${code}` },
        { status: 404 }
      )
    }

    const industryName = bizAll[0].industry_name || code
    const totalStores = (storeAll || []).reduce(
      (s, r) => s + (Number(r.store_count) || 0),
      0
    )
    const avgSurvival = avg(bizAll, 'survival_rate')
    const avgSales = avg(salesAll || [], 'monthly_avg_sales')

    // 지역별 예측
    const districtPredictions: {
      district_code: string
      district_name: string
      success_probability: number
    }[] = []

    for (const bizRow of bizAll) {
      const sgc = bizRow.sigungu_code
      if (!sgc) continue

      const sales = await fetchSalesStats(supabase, sgc, code)
      const stores = await fetchStoreStats(supabase, sgc, code)

      const feat = {
        survival_rate: num(bizRow.survival_rate, 75),
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

      const pred = fallbackPredict(feat)
      const { name, sido } = await getDistrictName(supabase, sgc)

      districtPredictions.push({
        district_code: sgc,
        district_name: fullName(name, sido),
        success_probability: pred.success_probability,
      })
    }

    districtPredictions.sort(
      (a, b) => b.success_probability - a.success_probability
    )

    return NextResponse.json({
      industry_code: code,
      industry_name: industryName,
      total_stores: totalStores,
      avg_survival_rate: Math.round(avgSurvival * 10) / 10,
      avg_monthly_sales: Math.round(avgSales),
      top_regions: districtPredictions.slice(0, limit),
    })
  } catch (err) {
    console.error('[IndustryStats] Exception:', err)
    return NextResponse.json(
      { detail: '업종 통계 조회 중 오류' },
      { status: 500 }
    )
  }
}
