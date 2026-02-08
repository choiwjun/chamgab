/**
 * GET /api/commercial/districts/[code]/growth-potential
 *
 * 성장 가능성 분석
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  fetchSalesStats,
  fetchBusinessStats,
  latestMonth,
  avg,
} from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()
    const salesData = latestMonth(await fetchSalesStats(supabase, code))
    const bizData = latestMonth(await fetchBusinessStats(supabase, code))

    const salesGrowthRate = avg(salesData, 'sales_growth_rate')
    const monthlyAvgSales = avg(salesData, 'monthly_avg_sales')
    const survivalRate = bizData.length ? avg(bizData, 'survival_rate') : 70

    const trend =
      salesGrowthRate > 3 ? '상승' : salesGrowthRate < -3 ? '하락' : '보합'
    const growthFromSales = Math.min(
      Math.max(((salesGrowthRate + 10) / 20) * 50, 0),
      50
    )
    const growthScore = Math.round(
      growthFromSales + (survivalRate / 100) * 30 + 15
    )

    const prediction3months = {
      sales: Math.round(monthlyAvgSales * (1 + salesGrowthRate / 100)),
      growth_rate: Math.round(salesGrowthRate * 1.1 * 100) / 100,
      confidence: Math.abs(salesGrowthRate) < 10 ? 78 : 65,
    }

    const signals: { type: string; message: string }[] = []
    if (salesGrowthRate > 5) {
      signals.push({
        type: 'positive',
        message: `매출 지속 증가 중 (+${salesGrowthRate.toFixed(1)}%)`,
      })
    } else if (salesGrowthRate < -5) {
      signals.push({
        type: 'negative',
        message: `매출 감소 추세 (${salesGrowthRate.toFixed(1)}%)`,
      })
    } else {
      signals.push({ type: 'neutral', message: '매출 안정세 유지' })
    }
    if (survivalRate > 75) {
      signals.push({
        type: 'positive',
        message: `높은 생존율 (${survivalRate.toFixed(1)}%)`,
      })
    } else if (survivalRate < 60) {
      signals.push({
        type: 'negative',
        message: `낮은 생존율 (${survivalRate.toFixed(1)}%)`,
      })
    }

    let recommendation: string
    if (growthScore >= 70) {
      recommendation = '지금이 진입 적기'
    } else if (growthScore >= 50) {
      recommendation = '신중한 검토 후 진입'
    } else {
      recommendation = '시장 상황 개선 후 재검토 권장'
    }

    return NextResponse.json({
      growth_score: growthScore,
      trend,
      sales_growth_rate: Math.round(salesGrowthRate * 100) / 100,
      prediction_3months: prediction3months,
      signals,
      recommendation,
    })
  } catch (err) {
    console.error('[GrowthPotential] Exception:', err)
    return NextResponse.json(
      { detail: '성장 가능성 분석 오류' },
      { status: 500 }
    )
  }
}
