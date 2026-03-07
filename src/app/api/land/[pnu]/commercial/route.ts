export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  INDUSTRY_NAMES,
  fetchBusinessStats,
  fetchFootTraffic,
  fetchSalesStats,
  fullName,
  getDistrictName,
  getSupabase,
  isExcludedIndustry,
  latestByIndustry,
  num,
} from '@/app/api/commercial/_helpers'
import type { LandParcel, LandTransaction } from '@/types/land'

interface LandCommercialParams {
  params: Promise<{ pnu: string }>
}

interface RegionRow {
  code: string
  name: string
  parent_code: string | null
}

interface ParcelSummary {
  pnu: string
  sido: string
  sigungu: string
  eupmyeondong: string | null
  jibun: string | null
  land_category: string | null
  zoning: string | null
  area_m2: number | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, '').trim().toLowerCase()
}

async function fetchParcelByPnu(
  supabase: SupabaseClient,
  pnu: string
): Promise<LandParcel | null> {
  const { data, error } = await supabase
    .from('land_parcels')
    .select('*')
    .eq('pnu', pnu)
    .single()

  if (error || !data) return null
  return data as LandParcel
}

async function fetchParcelById(
  supabase: SupabaseClient,
  parcelId: string
): Promise<LandParcel | null> {
  const { data, error } = await supabase
    .from('land_parcels')
    .select('*')
    .eq('id', parcelId)
    .single()

  if (error || !data) return null
  return data as LandParcel
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

async function fetchTransactionById(
  supabase: SupabaseClient,
  transactionId: string
): Promise<LandTransaction | null> {
  const { data, error } = await supabase
    .from('land_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('is_cancelled', false)
    .single()

  if (error || !data) return null
  return data as LandTransaction
}

function buildSyntheticParcelFromTransaction(tx: LandTransaction): LandParcel {
  const nowIso = new Date().toISOString()

  return {
    id: `tx-${tx.id}`,
    pnu: tx.parcel_id || `tx-${tx.id}`,
    sido: tx.sido,
    sigungu: tx.sigungu,
    eupmyeondong: tx.eupmyeondong || null,
    jibun: tx.jibun || null,
    land_category: tx.land_category || 'unknown',
    zoning: null,
    area_m2: tx.area_m2 || null,
    location: null,
    latest_official_price_per_m2: null,
    latest_official_price_year: null,
    latest_transaction_price: tx.price || null,
    latest_transaction_date: tx.transaction_date || null,
    latest_price_per_m2: tx.price_per_m2 || null,
    created_at: tx.created_at || nowIso,
    updated_at: nowIso,
  }
}

async function fetchZoningDetail(
  supabase: SupabaseClient,
  parcelId: string
): Promise<string | null> {
  if (!parcelId) return null

  const { data } = await supabase
    .from('land_characteristics')
    .select('zoning_detail')
    .eq('parcel_id', parcelId)
    .limit(1)

  const zoningDetail = data?.[0]?.zoning_detail
  return typeof zoningDetail === 'string' && zoningDetail.trim().length > 0
    ? zoningDetail
    : null
}

async function resolveDistrictCodeForParcel(
  supabase: SupabaseClient,
  parcel: LandParcel
): Promise<string | null> {
  const sigunguNorm = normalizeText(parcel.sigungu || '')
  const sidoNorm = normalizeText(parcel.sido || '')
  if (!sigunguNorm) return null

  const tryExact = await supabase
    .from('regions')
    .select('code,name,parent_code')
    .eq('level', 2)
    .eq('name', parcel.sigungu)
    .limit(20)

  const tryFuzzy = await supabase
    .from('regions')
    .select('code,name,parent_code')
    .eq('level', 2)
    .ilike('name', `%${parcel.sigungu}%`)
    .limit(50)

  const candidates = [
    ...((tryExact.data || []) as RegionRow[]),
    ...((tryFuzzy.data || []) as RegionRow[]),
  ]

  if (!candidates.length) return null

  const uniq = new Map<string, RegionRow>()
  for (const row of candidates) {
    if (!uniq.has(row.code)) uniq.set(row.code, row)
  }

  const list = Array.from(uniq.values())
  const parentCodes = Array.from(
    new Set(
      list
        .map((row) => row.parent_code)
        .filter((code): code is string => typeof code === 'string' && !!code)
    )
  )
  const parentMap = new Map<string, string>()
  if (parentCodes.length > 0) {
    const { data: parentRows } = await supabase
      .from('regions')
      .select('code,name')
      .in('code', parentCodes)
    for (const row of (parentRows || []) as Array<{
      code: string
      name: string
    }>) {
      parentMap.set(row.code, row.name || '')
    }
  }

  const scored = list
    .map((row) => {
      const nameNorm = normalizeText(row.name || '')
      const sidoName = parentMap.get(row.parent_code || '') || ''
      const sidoNameNorm = normalizeText(sidoName)

      let score = 0
      if (nameNorm === sigunguNorm) score += 50
      else if (
        nameNorm.includes(sigunguNorm) ||
        sigunguNorm.includes(nameNorm)
      ) {
        score += 30
      }

      if (sidoNorm && sidoNameNorm === sidoNorm) score += 30
      else if (
        sidoNorm &&
        (sidoNameNorm.startsWith(sidoNorm.slice(0, 2)) ||
          sidoNorm.startsWith(sidoNameNorm.slice(0, 2)))
      ) {
        score += 12
      }

      return { code: row.code.slice(0, 5), score }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]?.code || null
}

function buildLandSuitability(
  parcel: ParcelSummary,
  zoningDetail: string | null
) {
  let score = 60
  const factors: string[] = []

  const landCategory = String(parcel.land_category || '')
  const zoningText = `${parcel.zoning || ''} ${zoningDetail || ''}`

  const positiveLandCategory = new Set([
    '대',
    '잡종지',
    '공장용지',
    '주차장',
    '창고용지',
  ])
  const restrictiveLandCategory = new Set([
    '임야',
    '전',
    '답',
    '하천',
    '도로',
    '묘지',
    '공원',
    '학교용지',
  ])

  if (positiveLandCategory.has(landCategory)) {
    score += 10
    factors.push(`지목(${landCategory}) 기준 상업 활용 유리`)
  } else if (restrictiveLandCategory.has(landCategory)) {
    score -= 10
    factors.push(`지목(${landCategory}) 기준 상업 활용 제약 가능`)
  } else if (landCategory) {
    factors.push(`지목(${landCategory}) 특성은 중립`)
  }

  const hasCommercialZoning =
    zoningText.includes('상업') ||
    zoningText.includes('준주거') ||
    zoningText.includes('중심지')
  const hasRestrictiveZoning =
    zoningText.includes('녹지') ||
    zoningText.includes('농림') ||
    zoningText.includes('보전') ||
    zoningText.includes('관리')

  if (hasCommercialZoning) {
    score += 12
    factors.push('용도지역 기준 상업/근린 업종 친화적')
  } else if (hasRestrictiveZoning) {
    score -= 8
    factors.push('용도지역 기준 상업 업종 제약 가능')
  }

  const area = Number(parcel.area_m2 || 0)
  const areaSmall = area > 0 && area < 60
  const areaMedium = area >= 80 && area <= 1200
  const areaLarge = area > 3000

  if (areaMedium) {
    score += 6
    factors.push(`면적 ${Math.round(area)}㎡로 상업 운영 가능한 규모`)
  } else if (areaSmall) {
    score -= 6
    factors.push(`면적 ${Math.round(area)}㎡로 업종 선택 폭 제한`)
  } else if (areaLarge) {
    score -= 3
    factors.push(`면적 ${Math.round(area)}㎡로 초기 고정비 부담 가능`)
  }

  return {
    suitabilityScore: Math.round(clamp(score, 25, 95)),
    factors,
    hasCommercialZoning,
    hasRestrictiveZoning,
    restrictiveLandCategory: restrictiveLandCategory.has(landCategory),
    areaSmall,
    areaMedium,
    areaLarge,
  }
}

function industryPrefix(code: string) {
  return (code || '').trim().toUpperCase().slice(0, 1)
}

function getLandAdjustmentForIndustry(
  industryCode: string,
  context: ReturnType<typeof buildLandSuitability>
) {
  const prefix = industryPrefix(industryCode)
  const isRetailLike = ['Q', 'D', 'R', 'N', 'I', 'S'].includes(prefix)

  let adjustment = 0
  if (context.hasCommercialZoning && isRetailLike) adjustment += 6
  if (context.hasRestrictiveZoning && isRetailLike) adjustment -= 6
  if (context.restrictiveLandCategory && isRetailLike) adjustment -= 5
  if (context.areaSmall && ['Q', 'D', 'R', 'N'].includes(prefix))
    adjustment -= 4
  if (context.areaMedium && isRetailLike) adjustment += 2
  if (context.areaLarge && ['Q', 'D', 'R', 'N'].includes(prefix))
    adjustment -= 1

  return Math.round(clamp(adjustment, -18, 12))
}

function getTimeFit(primaryTime: string, industryCode: string) {
  const prefix = industryPrefix(industryCode)
  if (primaryTime === 'lunch' && prefix === 'Q') return 6
  if (primaryTime === 'evening' && ['Q', 'I', 'S'].includes(prefix)) return 5
  if (primaryTime === 'afternoon' && ['D', 'R', 'N'].includes(prefix)) return 4
  return 1
}

const AGE_INDUSTRY_MATCH: Record<string, string[]> = {
  '10s': ['Q06', 'Q07', 'Q08', 'Q14', 'Q11', 'S03'],
  '20s': ['Q12', 'Q13', 'Q06', 'R01', 'R03', 'I02', 'Q11', 'S02'],
  '30s': ['Q01', 'Q12', 'Q04', 'S02', 'I01', 'S01', 'Q13'],
  '40s': ['Q01', 'Q04', 'D01', 'S01', 'N01', 'S04', 'I01'],
  '50s': ['Q01', 'D01', 'N01', 'N03', 'D03', 'D05'],
  '60s': ['Q01', 'D01', 'N01', 'N03', 'D05', 'D04'],
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

interface RegulatoryGate {
  status: 'pass' | 'hold'
  reasons: string[]
  requires_verification: boolean
}

const STRICT_NON_COMMERCIAL_CATEGORIES = new Set([
  '전',
  '답',
  '과수원',
  '임야',
  '목장용지',
  '양어장',
  '염전',
  '하천',
  '유지',
  '도로',
  '철도용지',
  '공원',
  '학교용지',
  '사적지',
])

const RESTRICTIVE_ZONING_KEYWORDS = [
  '농림',
  '보전',
  '자연환경보전',
  '생산관리',
  '보전관리',
  '농업진흥',
]

function evaluateRegulatoryGate(
  parcel: ParcelSummary,
  zoningDetail: string | null
): RegulatoryGate {
  const rawCategory = String(parcel.land_category || '').trim()
  const normalizedCategory = normalizeText(rawCategory)
  const zoningText = `${parcel.zoning || ''} ${zoningDetail || ''}`.trim()
  const normalizedZoning = normalizeText(zoningText)
  const reasons: string[] = []

  const categoryBlocked =
    rawCategory.length > 0 &&
    (STRICT_NON_COMMERCIAL_CATEGORIES.has(rawCategory) ||
      STRICT_NON_COMMERCIAL_CATEGORIES.has(normalizedCategory))

  const matchedRestrictiveZoning = RESTRICTIVE_ZONING_KEYWORDS.find(
    (keyword) =>
      zoningText.includes(keyword) ||
      normalizedZoning.includes(normalizeText(keyword))
  )

  if (categoryBlocked) {
    reasons.push(
      `지목(${rawCategory})은 상업 업종 인허가 가능성이 낮아 추천을 보류합니다.`
    )
  }

  if (matchedRestrictiveZoning) {
    reasons.push(
      `용도지역(${matchedRestrictiveZoning})은 상업시설 입지 제약이 커서 추천을 보류합니다.`
    )
  }

  if (!zoningText) {
    reasons.push(
      '용도지역 정보가 없어 법적 인허가 가능 여부를 확인하기 전까지 추천을 보류합니다.'
    )
  }

  if (categoryBlocked || matchedRestrictiveZoning || !zoningText) {
    return {
      status: 'hold',
      reasons,
      requires_verification: true,
    }
  }

  return {
    status: 'pass',
    reasons: [],
    requires_verification: false,
  }
}

export async function GET(_request: Request, { params }: LandCommercialParams) {
  try {
    const { pnu: rawPnu } = await params
    const pnu = decodeURIComponent(rawPnu || '').trim()

    if (!pnu) {
      return NextResponse.json({ error: 'pnu is required' }, { status: 400 })
    }

    const supabase = getSupabase()
    let parcel = await fetchParcelByPnu(supabase, pnu)

    // Compatibility: some links may pass land_parcels.id(UUID) instead of PNU.
    if (!parcel && looksLikeUuid(pnu)) {
      parcel = await fetchParcelById(supabase, pnu)
    }

    if (!parcel && pnu.startsWith('tx-')) {
      const txId = pnu.slice(3)
      const tx = txId ? await fetchTransactionById(supabase, txId) : null
      if (tx) {
        parcel = buildSyntheticParcelFromTransaction(tx)
      }
    }

    if (!parcel) {
      return NextResponse.json({ error: 'parcel not found' }, { status: 404 })
    }

    const zoningDetail =
      parcel.id && !parcel.id.startsWith('tx-')
        ? await fetchZoningDetail(supabase, parcel.id)
        : null
    const districtCode = await resolveDistrictCodeForParcel(supabase, parcel)
    if (!districtCode) {
      return NextResponse.json(
        { error: 'district code mapping failed for parcel' },
        { status: 422 }
      )
    }

    const districtMeta = await getDistrictName(supabase, districtCode)
    const districtName = fullName(districtMeta.name, districtMeta.sido)

    const [footData, bizData, salesData] = await Promise.all([
      fetchFootTraffic(supabase, districtCode),
      fetchBusinessStats(supabase, districtCode),
      fetchSalesStats(supabase, districtCode),
    ])

    const ages: Record<string, number> = {
      '10s': num(footData.age_10s),
      '20s': num(footData.age_20s),
      '30s': num(footData.age_30s),
      '40s': num(footData.age_40s),
      '50s': num(footData.age_50s),
      '60s': num(footData.age_60s_plus),
    }
    const ageEntries = Object.entries(ages)
    const primaryAge = ageEntries.some(([, value]) => value > 0)
      ? ageEntries.sort((a, b) => b[1] - a[1])[0][0]
      : '30s'

    const timeMap: Record<string, number> = {
      morning: num(footData.time_06_11),
      lunch: num(footData.time_11_14),
      afternoon: num(footData.time_14_17),
      evening: num(footData.time_17_21),
      night: num(footData.time_21_24),
    }
    const timeEntries = Object.entries(timeMap)
    const primaryTime = timeEntries.some(([, value]) => value > 0)
      ? timeEntries.sort((a, b) => b[1] - a[1])[0][0]
      : 'lunch'

    const weekday = num(footData.weekday_avg)
    const weekend = num(footData.weekend_avg)
    const weekendRatio =
      weekday + weekend > 0 ? weekend / (weekday + weekend) : 0.5
    const dailyAvg = Math.round((weekday * 5 + weekend * 2) / 7)

    const bizLatest = latestByIndustry(bizData)
    const salesLatest = latestByIndustry(salesData)

    const salesMap: Record<string, number> = {}
    const growthMap: Record<string, number> = {}
    for (const row of salesLatest) {
      const code = String(row.industry_small_code || '')
      if (!code) continue
      salesMap[code] = num(row.monthly_avg_sales)
      growthMap[code] = num(row.sales_growth_rate)
    }

    const landContext = buildLandSuitability(
      {
        pnu: parcel.pnu,
        sido: parcel.sido,
        sigungu: parcel.sigungu,
        eupmyeondong: parcel.eupmyeondong,
        jibun: parcel.jibun,
        land_category: parcel.land_category,
        zoning: parcel.zoning,
        area_m2: parcel.area_m2,
      },
      zoningDetail
    )

    const regulatoryGate = evaluateRegulatoryGate(
      {
        pnu: parcel.pnu,
        sido: parcel.sido,
        sigungu: parcel.sigungu,
        eupmyeondong: parcel.eupmyeondong,
        jibun: parcel.jibun,
        land_category: parcel.land_category,
        zoning: zoningDetail || parcel.zoning,
        area_m2: parcel.area_m2,
      },
      zoningDetail
    )

    const recommendedIndustries = bizLatest
      .filter((row) => {
        const code = String(row.industry_small_code || '')
        const name =
          String(row.industry_name || '').trim() || INDUSTRY_NAMES[code] || code
        return !isExcludedIndustry(code, name)
      })
      .map((row) => {
        const code = String(row.industry_small_code || '')
        const industryName =
          String(row.industry_name || '').trim() || INDUSTRY_NAMES[code] || code
        const survival = num(row.survival_rate)
        const growth = growthMap[code] || 0
        const operatingCount = num(row.operating_count)
        const monthlySales = Math.round(
          clamp(salesMap[code] || 0, 0, 150_000_000)
        )

        const ageFit = (AGE_INDUSTRY_MATCH[primaryAge] || []).includes(code)
          ? 20
          : 0
        const timeFit = getTimeFit(primaryTime, code)
        const weekendFit =
          weekendRatio >= 0.45 &&
          ['Q', 'D', 'R', 'N'].includes(industryPrefix(code))
            ? 4
            : 0
        const competitionPenalty =
          operatingCount >= 180 ? 9 : operatingCount >= 120 ? 5 : 0

        const districtMatch = Math.round(
          clamp(
            survival * 0.5 +
              clamp(growth + 12, 0, 30) * 0.4 +
              ageFit +
              timeFit +
              weekendFit -
              competitionPenalty,
            10,
            100
          )
        )

        const landAdjustment = getLandAdjustmentForIndustry(code, landContext)
        const successProbability = Math.round(
          clamp(
            districtMatch * 0.74 +
              landContext.suitabilityScore * 0.26 +
              landAdjustment,
            5,
            95
          )
        )

        const reasons: string[] = []
        if (survival >= 80) reasons.push(`생존율 ${round1(survival)}%`)
        if (monthlySales >= 30_000_000) {
          reasons.push(`월 평균 매출 ${Math.round(monthlySales / 10000)}만원`)
        }
        if ((AGE_INDUSTRY_MATCH[primaryAge] || []).includes(code)) {
          reasons.push(`${primaryAge} 유동인구와 업종 매칭`)
        }
        if (landAdjustment !== 0) {
          reasons.push(
            landAdjustment > 0
              ? `토지 조건 보정 +${landAdjustment}`
              : `토지 조건 보정 ${landAdjustment}`
          )
        }
        if (reasons.length === 0) reasons.push('지역 상권 데이터 기반')

        return {
          industry_code: code,
          industry_name: industryName,
          success_probability: successProbability,
          district_match_score: districtMatch,
          land_adjustment: landAdjustment,
          expected_monthly_sales: monthlySales,
          reasons,
        }
      })
      .sort((a, b) => b.success_probability - a.success_probability)
      .slice(0, 5)

    const gatedRecommendedIndustries =
      regulatoryGate.status === 'pass' ? recommendedIndustries : []

    const top3 = gatedRecommendedIndustries.slice(0, 3)
    const avgTop3 =
      top3.length > 0
        ? top3.reduce((sum, row) => sum + row.success_probability, 0) /
          top3.length
        : 0
    const commercialScore =
      regulatoryGate.status === 'hold'
        ? Math.round(clamp(landContext.suitabilityScore * 0.45, 20, 45))
        : Math.round(
            clamp(avgTop3 * 0.75 + landContext.suitabilityScore * 0.25, 0, 100)
          )

    const competitionRows = bizLatest
      .map((row) => ({
        industry_name:
          String(row.industry_name || '').trim() ||
          INDUSTRY_NAMES[String(row.industry_small_code || '')] ||
          String(row.industry_small_code || ''),
        count: num(row.operating_count),
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)

    const competitionTotal = competitionRows.reduce(
      (sum, row) => sum + row.count,
      0
    )
    const densityScore = Math.round(
      clamp(100 - Math.min(70, competitionTotal / 12), 25, 95)
    )

    const insights: string[] = []
    const topIndustry = gatedRecommendedIndustries[0]

    insights.push(
      `${parcel.sido} ${parcel.sigungu} 기준 매핑 상권은 ${districtName}이며, 피크 시간대는 ${primaryTime}입니다.`
    )
    if (regulatoryGate.status === 'hold') {
      insights.push(
        `업종 추천을 보류했습니다: ${regulatoryGate.reasons.join(' / ')}`
      )
      insights.push(
        '토지이용계획확인원과 지자체 인허가 기준을 확인한 뒤 다시 분석해 주세요.'
      )
    }
    if (regulatoryGate.status === 'pass' && topIndustry) {
      insights.push(
        `해당 토지 조건에서 1순위 업종은 ${topIndustry.industry_name} (성공확률 ${topIndustry.success_probability}%)입니다.`
      )
    }
    if (landContext.factors.length > 0) {
      insights.push(
        `토지 조건 요약: ${landContext.factors.slice(0, 2).join(', ')}`
      )
    }
    insights.push(
      `경쟁 밀도 점수는 ${densityScore}점이며, 상위 경쟁 업종은 ${competitionRows
        .slice(0, 2)
        .map((row) => row.industry_name)
        .join(', ')}입니다.`
    )

    return NextResponse.json({
      pnu,
      parcel: {
        pnu: parcel.pnu,
        sido: parcel.sido,
        sigungu: parcel.sigungu,
        eupmyeondong: parcel.eupmyeondong,
        jibun: parcel.jibun,
        land_category: parcel.land_category,
        zoning: zoningDetail || parcel.zoning,
        area_m2: parcel.area_m2,
      },
      district: {
        code: districtCode,
        name: districtName,
      },
      commercial_score: commercialScore,
      regulatory_gate: regulatoryGate,
      land_context: {
        suitability_score: landContext.suitabilityScore,
        factors: landContext.factors,
      },
      recommended_industries: gatedRecommendedIndustries,
      foot_traffic: {
        daily_avg: dailyAvg,
        peak_time: primaryTime,
        weekend_ratio: round1(weekendRatio),
        demographics: ageEntries
          .map(([ageGroup, count]) => ({
            age_group: ageGroup,
            percentage:
              ageEntries.reduce((sum, [, value]) => sum + value, 0) > 0
                ? round1(
                    (count /
                      ageEntries.reduce((sum, [, value]) => sum + value, 0)) *
                      100
                  )
                : 0,
          }))
          .sort((a, b) => b.percentage - a.percentage)
          .slice(0, 4),
      },
      competition: {
        density_score: densityScore,
        top_industries: competitionRows.slice(0, 5),
      },
      insights,
      analyzed_at: new Date().toISOString(),
      source: 'land-commercial-v1',
    })
  } catch (error) {
    console.error('[land commercial] failed', error)
    const message = error instanceof Error ? error.message : 'analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
