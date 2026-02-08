/**
 * GET /api/commercial/districts/[code]
 *
 * 상권 상세 정보 (DistrictDetail) - Supabase 실데이터
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  getDistrictName,
  fullName,
  fetchBusinessStats,
  fetchSalesStats,
  fetchStoreStats,
  avg,
  sum,
} from '../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()

    const { name, sido } = await getDistrictName(supabase, code)
    const dname = fullName(name, sido)

    const bizStats = await fetchBusinessStats(supabase, code)
    const salesStats = await fetchSalesStats(supabase, code)
    const storeStats = await fetchStoreStats(supabase, code)

    const hasData =
      bizStats.length > 0 || salesStats.length > 0 || storeStats.length > 0

    // 최신 월 데이터만 사용 (24개월 전체 합산 방지)
    const latestMonth = storeStats.reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestStoreStats = latestMonth
      ? storeStats.filter((r) => String(r.base_year_month) === latestMonth)
      : storeStats

    const latestBizMonth = bizStats.reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestBizStats = latestBizMonth
      ? bizStats.filter((r) => String(r.base_year_month) === latestBizMonth)
      : bizStats

    const latestSalesMonth = salesStats.reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestSalesStats = latestSalesMonth
      ? salesStats.filter((r) => String(r.base_year_month) === latestSalesMonth)
      : salesStats

    const avgSurvival = avg(latestBizStats, 'survival_rate')
    const avgMonthlySales = avg(latestSalesStats, 'monthly_avg_sales')
    const avgGrowth = avg(latestSalesStats, 'sales_growth_rate')
    const totalStores = sum(latestStoreStats, 'store_count')
    const numIndustries = Math.max(latestStoreStats.length, 1)
    const competitionRatio = latestStoreStats.length
      ? Math.round((totalStores / numIndustries / 30) * 10) / 10
      : 0

    const statistics = {
      total_stores: totalStores,
      survival_rate: Math.round(avgSurvival * 10) / 10,
      monthly_avg_sales: Math.round(avgMonthlySales),
      sales_growth_rate: Math.round(avgGrowth * 10) / 10,
      competition_ratio: competitionRatio,
    }

    const desc = hasData
      ? `${dname} 상권 분석 (${bizStats.length}개 업종 데이터)`
      : `${dname} (상세 데이터 수집 예정)`

    return NextResponse.json({
      code,
      name: dname,
      description: desc,
      statistics,
    })
  } catch (err) {
    console.error('[DistrictDetail] Exception:', err)
    return NextResponse.json(
      { detail: '상권 상세 조회 중 오류' },
      { status: 500 }
    )
  }
}
