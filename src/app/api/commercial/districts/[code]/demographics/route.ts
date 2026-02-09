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
  latestByIndustry,
  isExcludedIndustry,
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

    const hasAgeData = Object.values(ages).some((v) => v > 0)
    const primaryTarget = hasAgeData
      ? Object.entries(demographics).sort(
          (a, b) => b[1].percentage - a[1].percentage
        )[0][0]
      : '30s'

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

    // 업종 추천 - 생존율 + 연령 매칭도 기반 점수
    const ageIndustryMatch: Record<string, string[]> = {
      '10s': ['Q06', 'Q08', 'Q07', 'Q14', 'S03'],
      '20s': ['Q12', 'Q13', 'Q06', 'R01', 'R03', 'I02'],
      '30s': ['Q01', 'Q12', 'Q04', 'S02', 'I01'],
      '40s': ['Q01', 'Q04', 'D01', 'N01', 'S01'],
      '50s': ['Q01', 'D01', 'N01', 'N03', 'D03'],
      '60s': ['Q01', 'D01', 'N01', 'N03', 'D04'],
    }
    const matchedCodes = ageIndustryMatch[primaryTarget] || []

    const bizAll = await fetchBusinessStats(supabase, code)
    let suggested = latestByIndustry(bizAll)
      .filter(
        (b) =>
          b.industry_small_code &&
          b.industry_name &&
          !isExcludedIndustry(
            String(b.industry_small_code),
            String(b.industry_name || '')
          )
      )
      .map((b) => {
        const ic = b.industry_small_code as string
        const survival = num(b.survival_rate)
        // 점수: 생존율(60%) + 연령 매칭(40%)
        let score = Math.round(survival * 0.6)
        if (matchedCodes.includes(ic)) score += 40
        else score += 10
        return {
          code: ic,
          name: b.industry_name as string,
          match_score: Math.min(score, 100),
        }
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 3)

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
