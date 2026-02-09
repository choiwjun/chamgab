/**
 * GET /api/commercial/districts/[code]/peak-hours
 *
 * 시간대별 유동인구 분석
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

    const times: Record<
      string,
      { time: string; traffic: number; score: number }
    > = {
      morning: { time: '06-11시', traffic: num(data.time_06_11), score: 0 },
      lunch: { time: '11-14시', traffic: num(data.time_11_14), score: 0 },
      afternoon: { time: '14-17시', traffic: num(data.time_14_17), score: 0 },
      evening: { time: '17-21시', traffic: num(data.time_17_21), score: 0 },
      night: { time: '21-24시', traffic: num(data.time_21_24), score: 0 },
    }

    const maxTraffic =
      Math.max(...Object.values(times).map((t) => t.traffic)) || 1
    for (const key of Object.keys(times)) {
      times[key].score = Math.round((times[key].traffic / maxTraffic) * 10)
    }

    const bestTime = Object.entries(times).sort(
      (a, b) => b[1].score - a[1].score
    )[0][0]

    return NextResponse.json({
      peak_hours: times,
      best_time: bestTime,
      recommendation: `${times[bestTime].time} 집중 운영 추천`,
    })
  } catch (err) {
    console.error('[PeakHours] Exception:', err)
    return NextResponse.json({ detail: '시간대 분석 오류' }, { status: 500 })
  }
}
