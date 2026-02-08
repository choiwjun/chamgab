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

    // 최신 월 데이터만 사용
    const latestStoreMonth = (storeAll || []).reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestStores = latestStoreMonth
      ? (storeAll || []).filter(
          (r) => String(r.base_year_month) === latestStoreMonth
        )
      : storeAll || []
    const totalStores = latestStores.reduce(
      (s, r) => s + (Number(r.store_count) || 0),
      0
    )

    const latestBizMonth = bizAll.reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestBiz = latestBizMonth
      ? bizAll.filter((r) => String(r.base_year_month) === latestBizMonth)
      : bizAll

    const latestSalesMonth = (salesAll || []).reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestSales = latestSalesMonth
      ? (salesAll || []).filter(
          (r) => String(r.base_year_month) === latestSalesMonth
        )
      : salesAll || []

    const avgSurvival = avg(latestBiz, 'survival_rate')
    const avgSales = avg(latestSales, 'monthly_avg_sales')

    // 메모리에서 sigungu_code별 인덱스 구축 (N+1 쿼리 제거)
    const salesByDistrict: Record<string, Record<string, unknown>> = {}
    for (const s of latestSales) {
      const sgc = String(s.sigungu_code || '')
      if (sgc) salesByDistrict[sgc] = s
    }
    const storesByDistrict: Record<string, Record<string, unknown>> = {}
    for (const s of latestStores) {
      const sgc = String(s.sigungu_code || '')
      if (sgc) storesByDistrict[sgc] = s
    }

    // 지역별 예측 (중복 sigungu_code 제거, DB 쿼리 없이 메모리 필터링)
    const seen = new Set<string>()
    const districtPredictions: {
      district_code: string
      district_name: string
      success_probability: number
    }[] = []

    for (const bizRow of latestBiz) {
      const sgc = String(bizRow.sigungu_code || '')
      if (!sgc || seen.has(sgc)) continue
      seen.add(sgc)

      const salesRow = salesByDistrict[sgc]
      const storeRow = storesByDistrict[sgc]

      const feat = {
        survival_rate: num(bizRow.survival_rate, 75),
        monthly_avg_sales: salesRow
          ? num(salesRow.monthly_avg_sales, 40000000)
          : 40000000,
        sales_growth_rate: salesRow ? num(salesRow.sales_growth_rate, 3) : 3,
        store_count: storeRow ? num(storeRow.store_count, 120) : 120,
        franchise_ratio: storeRow
          ? num(storeRow.store_count, 1) > 0
            ? num(storeRow.franchise_count) / num(storeRow.store_count, 1)
            : 0.3
          : 0.3,
        competition_ratio: 1.2,
      }

      districtPredictions.push({
        district_code: sgc,
        district_name: '', // 이름은 top N만 조회
        success_probability: fallbackPredict(feat).success_probability,
      })
    }

    districtPredictions.sort(
      (a, b) => b.success_probability - a.success_probability
    )

    // top N 결과만 이름 조회 (130개 전체 대신 5개만)
    const topN = districtPredictions.slice(0, limit)
    await Promise.all(
      topN.map(async (d) => {
        const { name, sido } = await getDistrictName(supabase, d.district_code)
        d.district_name = fullName(name, sido)
      })
    )

    return NextResponse.json({
      industry_code: code,
      industry_name: industryName,
      total_stores: totalStores,
      avg_survival_rate: Math.round(avgSurvival * 10) / 10,
      avg_monthly_sales: Math.round(avgSales),
      top_regions: topN,
    })
  } catch (err) {
    console.error('[IndustryStats] Exception:', err)
    return NextResponse.json(
      { detail: '업종 통계 조회 중 오류' },
      { status: 500 }
    )
  }
}
