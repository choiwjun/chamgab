/**
 * GET /api/commercial/districts/[code]/competition
 *
 * 경쟁 밀집도 분석
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSupabase,
  getDistrictName,
  fullName,
  fetchStoreStats,
  fetchBusinessStats,
  num,
  avg,
} from '../../../_helpers'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const supabase = getSupabase()
    const storeData = await fetchStoreStats(supabase, code)

    // 최신 월 데이터만 사용 (24개월 전체 합산 방지)
    const latestMonth = storeData.reduce((max, r) => {
      const ym = String(r.base_year_month || '')
      return ym > max ? ym : max
    }, '')
    const latestData = latestMonth
      ? storeData.filter((r) => String(r.base_year_month) === latestMonth)
      : storeData

    const totalStores = latestData.reduce((s, r) => s + num(r.store_count), 0)
    const totalFranchise = latestData.reduce(
      (s, r) => s + num(r.franchise_count),
      0
    )
    const franchiseRatio =
      totalStores > 0
        ? Math.round((totalFranchise / totalStores) * 1000) / 10
        : 0

    let densityScore: number
    let competitionLevel: string
    if (totalStores < 50) {
      densityScore = Math.round((totalStores / 50) * 3)
      competitionLevel = '낮음'
    } else if (totalStores < 300) {
      densityScore = 3 + Math.round(((totalStores - 50) / 250) * 4)
      competitionLevel = '중간'
    } else {
      densityScore =
        7 + Math.min(Math.round(((totalStores - 300) / 200) * 3), 3)
      competitionLevel = '높음'
    }

    // 대안 상권: 같은 시도 내 다른 시군구
    const alternatives: {
      code: string
      name: string
      distance: number
      store_count: number
      success_rate: number
      reason: string
    }[] = []

    try {
      const sidoPrefix = code.slice(0, 2)
      const { data: altResult } = await supabase
        .from('store_statistics')
        .select('sigungu_code, store_count, base_year_month')
        .like('sigungu_code', `${sidoPrefix}%`)
        .eq('base_year_month', latestMonth || '202601')

      const altStores: Record<string, number> = {}
      for (const row of altResult || []) {
        const sgc = row.sigungu_code || ''
        if (sgc && sgc !== code) {
          altStores[sgc] =
            (altStores[sgc] || 0) + (Number(row.store_count) || 0)
        }
      }

      const sortedAlts = Object.entries(altStores)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2)

      for (const [sgc, sc] of sortedAlts) {
        const { name, sido } = await getDistrictName(supabase, sgc)
        const biz = await fetchBusinessStats(supabase, sgc)
        const avgSurv = biz.length ? avg(biz, 'survival_rate', 70) : 70
        alternatives.push({
          code: sgc,
          name: fullName(name, sido),
          distance: 0,
          store_count: sc,
          success_rate: Math.round(avgSurv * 10) / 10,
          reason: sc < totalStores ? '낮은 경쟁도' : '유사한 경쟁 환경',
        })
      }
    } catch {
      // 대안 검색 실패 시 무시
    }

    let recommendation: string
    if (competitionLevel === '높음') {
      recommendation = '높은 경쟁도. 차별화 전략 필수 또는 대안 상권 검토'
    } else if (competitionLevel === '중간') {
      recommendation = '적절한 경쟁 환경. 틈새 시장 공략 가능'
    } else {
      recommendation = '낮은 경쟁도. 시장 선점 기회'
    }

    return NextResponse.json({
      competition_level: competitionLevel,
      total_stores: totalStores,
      franchise_ratio: franchiseRatio,
      density_score: densityScore,
      alternatives,
      recommendation,
    })
  } catch (err) {
    console.error('[Competition] Exception:', err)
    return NextResponse.json({ detail: '경쟁 분석 오류' }, { status: 500 })
  }
}
