/**
 * GET /api/commercial/districts/[code]/recommend-industry
 *
 * AI 업종 추천 - Supabase 실데이터 기반
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  getDistrictName,
  fullName,
  fetchFootTraffic,
  fetchBusinessStats,
  fetchSalesStats,
  latestByIndustry,
  num,
} from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()

    const { name, sido } = await getDistrictName(supabase, code)
    const districtName = fullName(name, sido)

    const footData = await fetchFootTraffic(supabase, code)
    const bizData = await fetchBusinessStats(supabase, code)
    const salesData = await fetchSalesStats(supabase, code)

    // 유동인구 분석
    const ages: Record<string, number> = {
      '10s': num(footData.age_10s),
      '20s': num(footData.age_20s),
      '30s': num(footData.age_30s),
      '40s': num(footData.age_40s),
      '50s': num(footData.age_50s),
      '60s': num(footData.age_60s_plus),
    }
    const primaryAge = Object.values(ages).some((v) => v > 0)
      ? Object.entries(ages).sort((a, b) => b[1] - a[1])[0][0]
      : '30s'

    const times: Record<string, number> = {
      morning: num(footData.time_06_11),
      lunch: num(footData.time_11_14),
      afternoon: num(footData.time_14_17),
      evening: num(footData.time_17_21),
      night: num(footData.time_21_24),
    }
    const primaryTime = Object.values(times).some((v) => v > 0)
      ? Object.entries(times).sort((a, b) => b[1] - a[1])[0][0]
      : 'lunch'

    const weekday = num(footData.weekday_avg)
    const weekend = num(footData.weekend_avg)
    const weekendRatio =
      weekday + weekend > 0
        ? Math.round((weekend / (weekday + weekend)) * 1000) / 10
        : 50

    // 업종별 최신 월 데이터만 사용 (중복 제거)
    const bizLatest = latestByIndustry(bizData)
    const salesLatest = latestByIndustry(salesData)

    // 매출 매핑
    const salesMap: Record<string, number> = {}
    const growthMap: Record<string, number> = {}
    for (const s of salesLatest) {
      const ic = s.industry_small_code as string
      if (ic) {
        salesMap[ic] = num(s.monthly_avg_sales)
        growthMap[ic] = num(s.sales_growth_rate)
      }
    }

    // 연령-업종 매칭 (실제 소비 패턴 기반)
    const ageMatch: Record<string, string[]> = {
      '10s': ['Q06', 'Q07', 'Q08', 'Q14', 'Q11', 'S03'],
      '20s': ['Q12', 'Q13', 'Q06', 'R01', 'R03', 'I02', 'Q11', 'S02'],
      '30s': ['Q01', 'Q12', 'Q04', 'S02', 'I01', 'S01', 'Q13'],
      '40s': ['Q01', 'Q04', 'D01', 'S01', 'N01', 'S04', 'I01'],
      '50s': ['Q01', 'D01', 'N01', 'N03', 'L01', 'D03'],
      '60s': ['Q01', 'D01', 'N01', 'N03', 'L01', 'L03'],
    }

    const recommendations = bizLatest
      .map((b) => {
        const ic = b.industry_small_code as string
        const iname = b.industry_name as string
        const survival = num(b.survival_rate)
        const monthlySales = salesMap[ic] || 0
        const growth = growthMap[ic] || 0

        // 점수: 생존율(50%) + 매출성장(30%) + 연령매칭(20%)
        let score = Math.round(survival * 0.5)
        score += Math.round(Math.min(Math.max(growth + 10, 0), 30) * 0.3)
        if ((ageMatch[primaryAge] || []).includes(ic)) score += 20

        const reasons: string[] = []
        if (survival > 85) reasons.push(`높은 생존율 (${survival.toFixed(1)}%)`)
        else if (survival > 70)
          reasons.push(`안정적 생존율 (${survival.toFixed(1)}%)`)
        if (monthlySales > 30000000)
          reasons.push(`월 평균 매출 ${Math.round(monthlySales / 10000)}만원`)
        if ((ageMatch[primaryAge] || []).includes(ic))
          reasons.push(`${primaryAge} 주요 고객층과 높은 매칭도`)

        const estimatedProfit = monthlySales * 0.15
        const breakeven =
          estimatedProfit > 0
            ? Math.max(6, Math.round(50000000 / estimatedProfit))
            : 18

        return {
          industry_code: ic,
          industry_name: iname,
          match_score: Math.min(score, 100),
          expected_monthly_sales: Math.round(monthlySales),
          breakeven_months: breakeven,
          reasons: reasons.length ? reasons : ['상권 데이터 기반 분석'],
        }
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 5)

    return NextResponse.json({
      district_code: code,
      district_name: districtName,
      recommendations,
      analysis_summary: {
        primary_age_group: primaryAge,
        peak_time: primaryTime,
        weekend_ratio: Math.round((weekendRatio / 100) * 1000) / 1000,
      },
      analyzed_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[RecommendIndustry] Exception:', err)
    return NextResponse.json({ detail: '업종 추천 분석 오류' }, { status: 500 })
  }
}
