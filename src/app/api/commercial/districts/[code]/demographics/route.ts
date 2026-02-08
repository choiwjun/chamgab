/**
 * GET /api/commercial/districts/[code]/demographics
 *
 * 연령대별 유동인구 분석
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  fetchFootTraffic,
  fetchBusinessStats,
  num,
} from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()
    const data = await fetchFootTraffic(supabase, code)

    if (!Object.keys(data).length) {
      return NextResponse.json(
        { detail: `유동인구 데이터가 없습니다: ${code}` },
        { status: 404 }
      )
    }

    const ages: Record<string, number> = {
      '10s': num(data.age_10s),
      '20s': num(data.age_20s),
      '30s': num(data.age_30s),
      '40s': num(data.age_40s),
      '50s': num(data.age_50s),
      '60s': num(data.age_60s_plus),
    }
    const total = Object.values(ages).reduce((a, b) => a + b, 0) || 1

    const demographics: Record<
      string,
      { count: number; percentage: number; score: number }
    > = {}
    for (const [age, count] of Object.entries(ages)) {
      const percentage = Math.round((count / total) * 1000) / 10
      demographics[age] = {
        count,
        percentage,
        score: percentage > 0 ? Math.round((percentage / 100) * 10) : 0,
      }
    }

    const primaryTarget = Object.entries(demographics).sort(
      (a, b) => b[1].percentage - a[1].percentage
    )[0][0]

    const personaMap: Record<
      string,
      { name: string; age: string; lifestyle: string }
    > = {
      '10s': { name: '10대 학생', age: '13-19세', lifestyle: '학업, SNS' },
      '20s': {
        name: 'MZ세대 직장인',
        age: '20-29세',
        lifestyle: 'SNS 활발, 트렌드 민감',
      },
      '30s': {
        name: '30대 직장인',
        age: '30-39세',
        lifestyle: '가족, 안정 추구',
      },
      '40s': { name: '40대 가장', age: '40-49세', lifestyle: '가족 중심' },
      '50s': { name: '50대 중년', age: '50-59세', lifestyle: '안정 중시' },
      '60s': { name: '60대 이상', age: '60세+', lifestyle: '여유, 건강' },
    }

    // 업종 추천 - 해당 지역 업종별 생존율
    const bizAll = await fetchBusinessStats(supabase, code)
    let suggested = bizAll
      .filter((b) => b.industry_small_code && b.industry_name)
      .sort((a, b) => num(b.survival_rate) - num(a.survival_rate))
      .slice(0, 3)
      .map((b) => ({
        code: b.industry_small_code as string,
        name: b.industry_name as string,
        match_score: Math.min(Math.round(num(b.survival_rate)), 100),
      }))

    if (!suggested.length) {
      suggested = [{ code: 'Q01', name: '한식음식점', match_score: 80 }]
    }

    return NextResponse.json({
      demographics,
      primary_target: primaryTarget,
      persona: personaMap[primaryTarget] || personaMap['20s'],
      suggested_industries: suggested,
    })
  } catch (err) {
    console.error('[Demographics] Exception:', err)
    return NextResponse.json({ detail: '연령대 분석 오류' }, { status: 500 })
  }
}
