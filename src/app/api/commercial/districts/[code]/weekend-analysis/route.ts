/**
 * GET /api/commercial/districts/[code]/weekend-analysis
 *
 * 주말/평일 비교 분석
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabase, fetchFootTraffic, num } from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()
    const data = await fetchFootTraffic(supabase, code)

    const weekdayAvg = num(data.weekday_avg)
    const weekendAvg = num(data.weekend_avg)
    const totalAvg = weekdayAvg + weekendAvg
    const weekendRatio =
      totalAvg > 0 ? Math.round((weekendAvg / totalAvg) * 1000) / 10 : 50.0
    const advantage = weekendAvg > weekdayAvg ? 'weekend' : 'weekday'
    const differencePercent =
      weekdayAvg > 0
        ? Math.round((Math.abs(weekendAvg - weekdayAvg) / weekdayAvg) * 1000) /
          10
        : 0

    return NextResponse.json({
      weekday_avg: weekdayAvg,
      weekend_avg: weekendAvg,
      weekend_ratio: weekendRatio,
      advantage,
      difference_percent: differencePercent,
      recommendation:
        advantage === 'weekend'
          ? '주말 특별 프로모션 추천'
          : '평일 고객 유치 전략 강화 추천',
    })
  } catch (err) {
    console.error('[WeekendAnalysis] Exception:', err)
    return NextResponse.json({ detail: '주말/평일 분석 오류' }, { status: 500 })
  }
}
