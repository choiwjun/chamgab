import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LandParcel } from '@/types/land'
import {
  fetchBusinessStats,
  fetchDistrictChar,
  fetchFootTraffic,
  fetchSalesStats,
  fetchStoreStats,
  isExcludedIndustry,
  latestByIndustry,
  num,
} from '@/app/api/commercial/_helpers'

interface CommercialFactor {
  name: string
  impact: number
  direction: 'positive' | 'negative'
}

interface RecommendedIndustry {
  industry_name: string
  industry_code: string
  success_probability: number
  factors: CommercialFactor[]
  estimated_store_count: number
}

export interface LandCommercialAnalysis {
  district_code: string | null
  district_name: string
  commercial_score: number
  recommended_industries: RecommendedIndustry[]
  foot_traffic: {
    daily_avg: number
    peak_time: string
    demographics: { age_group: string; percentage: number }[]
  }
  competition: {
    radius_500m: { industry: string; count: number }[]
    density_score: number
  }
  insights: string[]
  data_freshness: {
    business: string | null
    sales: string | null
    store: string | null
  }
  source: 'land-commercial-v2-ml' | 'land-commercial-v1-fallback'
}

interface BuildLandCommercialInput {
  parcel: LandParcel
}

interface MlFactor {
  name: string
  impact: number
  direction: string
}

interface MlPredictResult {
  success_probability: number
  confidence: number
  factors: MlFactor[]
}

interface CandidateIndustry {
  industry_code: string
  industry_name: string
  survival_rate: number
  monthly_avg_sales: number
  sales_growth_rate: number
  store_count: number
  franchise_ratio: number
  competition_ratio: number
}

const ML_API_URL = process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL || ''

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function parsePointFromGeometry(
  location: LandParcel['location'] | string | null
): { lat: number; lng: number } | null {
  if (!location) return null

  if (typeof location === 'string') {
    const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i)
    if (!match) return null
    const lng = Number(match[1])
    const lat = Number(match[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  if (
    location.type === 'Point' &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length >= 2
  ) {
    const [lng, lat] = location.coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  return null
}

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371000 * c
}

async function resolveSigunguCode(parcel: LandParcel): Promise<string | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('regions')
    .select('code, name')
    .eq('level', 2)
    .ilike('name', `%${parcel.sigungu}%`)
    .limit(20)

  if (error || !data || data.length === 0) return null

  const normalizedSigungu = parcel.sigungu.replace(/\s/g, '')
  const exact = data.find(
    (row) => String(row.name || '').replace(/\s/g, '') === normalizedSigungu
  )
  if (exact?.code) return String(exact.code).slice(0, 5)

  return String(data[0].code || '').slice(0, 5) || null
}

async function callMlPredict(params: {
  districtCode: string
  industryCode: string
  overrides: CandidateIndustry
}): Promise<MlPredictResult | null> {
  if (!ML_API_URL) return null

  const query = new URLSearchParams({
    district_code: params.districtCode,
    industry_code: params.industryCode,
    survival_rate: String(params.overrides.survival_rate),
    monthly_avg_sales: String(Math.round(params.overrides.monthly_avg_sales)),
    sales_growth_rate: String(params.overrides.sales_growth_rate),
    store_count: String(Math.round(params.overrides.store_count)),
    franchise_ratio: String(params.overrides.franchise_ratio),
    competition_ratio: String(params.overrides.competition_ratio),
  })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(`${ML_API_URL}/api/commercial/predict?${query}`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as Record<string, unknown>
    if (
      typeof data.success_probability !== 'number' ||
      typeof data.confidence !== 'number' ||
      !Array.isArray(data.factors)
    ) {
      return null
    }

    return {
      success_probability: clamp(data.success_probability, 0, 100),
      confidence: clamp(data.confidence, 0, 100),
      factors: (data.factors as MlFactor[]).slice(0, 5),
    }
  } catch {
    return null
  }
}

function getPeakTimeLabel(foot: Record<string, number>): string {
  const candidates: Record<string, number> = {
    '06-11': num(foot.time_06_11),
    '11-14': num(foot.time_11_14),
    '14-17': num(foot.time_14_17),
    '17-21': num(foot.time_17_21),
    '21-24': num(foot.time_21_24),
  }

  const sorted = Object.entries(candidates).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[1] > 0 ? sorted[0][0] : 'N/A'
}

function getDemographics(foot: Record<string, number>) {
  const ageRows = [
    { age_group: '10대', value: num(foot.age_10s) },
    { age_group: '20대', value: num(foot.age_20s) },
    { age_group: '30대', value: num(foot.age_30s) },
    { age_group: '40대', value: num(foot.age_40s) },
    { age_group: '50대', value: num(foot.age_50s) },
    { age_group: '60대+', value: num(foot.age_60s_plus) },
  ]

  const total = ageRows.reduce((sum, row) => sum + row.value, 0)
  if (total <= 0) return []

  return ageRows
    .map((row) => ({
      age_group: row.age_group,
      percentage: round1((row.value / total) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage)
}

async function fetchCompetitionWithin500m(args: {
  supabase: SupabaseClient
  parcel: LandParcel
  districtCode: string
}): Promise<{ radius_500m: { industry: string; count: number }[]; density_score: number }> {
  const point = parsePointFromGeometry(args.parcel.location)
  if (!point) {
    return { radius_500m: [], density_score: 0 }
  }

  const { data: regionRows, error: regionError } = await args.supabase
    .from('regions')
    .select('code, latitude, longitude')
    .eq('level', 3)
    .like('code', `${args.districtCode}%`)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(5000)

  if (regionError || !regionRows || regionRows.length === 0) {
    return { radius_500m: [], density_score: 0 }
  }

  const nearbyDistrictCodes = (regionRows as Array<Record<string, unknown>>)
    .map((row) => {
      const lat = Number(row.latitude)
      const lng = Number(row.longitude)
      const code = String(row.code || '')
      if (!code || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
      const distanceMeters = haversineDistanceMeters(point.lat, point.lng, lat, lng)
      if (distanceMeters > 500) return null
      return code
    })
    .filter((code): code is string => Boolean(code))

  if (nearbyDistrictCodes.length === 0) {
    return { radius_500m: [], density_score: 0 }
  }

  const { data: storeRows, error: storeError } = await args.supabase
    .from('store_statistics')
    .select('commercial_district_code,industry_small_code,industry_name,store_count,base_year_month')
    .in('commercial_district_code', nearbyDistrictCodes)
    .limit(10000)

  if (storeError || !storeRows || storeRows.length === 0) {
    return { radius_500m: [], density_score: 0 }
  }

  const latestByKey = new Map<string, Record<string, unknown>>()
  for (const row of storeRows as Array<Record<string, unknown>>) {
    const district = String(row.commercial_district_code || '')
    const industry = String(row.industry_small_code || '')
    const month = String(row.base_year_month || '')
    if (!district || !industry) continue
    const key = `${district}::${industry}`
    const prev = latestByKey.get(key)
    if (!prev || String(prev.base_year_month || '') < month) {
      latestByKey.set(key, row)
    }
  }

  const byIndustry = new Map<string, number>()
  for (const row of Array.from(latestByKey.values())) {
    const name = String(row.industry_name || row.industry_small_code || '')
    if (!name) continue
    const count = Math.max(0, Math.round(num(row.store_count)))
    byIndustry.set(name, (byIndustry.get(name) || 0) + count)
  }

  const radius500m = Array.from(byIndustry.entries())
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const totalStores = radius500m.reduce((sum, row) => sum + row.count, 0)
  const densityScore = round1(clamp(100 - totalStores / 8, 15, 95))

  return {
    radius_500m: radius500m,
    density_score: densityScore,
  }
}

export async function buildLandCommercialAnalysis(
  input: BuildLandCommercialInput
): Promise<LandCommercialAnalysis> {
  const districtCode = await resolveSigunguCode(input.parcel)
  const districtName = `${input.parcel.sido} ${input.parcel.sigungu}`.trim()

  if (!districtCode) {
    return {
      district_code: null,
      district_name: districtName,
      commercial_score: 0,
      recommended_industries: [],
      foot_traffic: {
        daily_avg: 0,
        peak_time: 'N/A',
        demographics: [],
      },
      competition: { radius_500m: [], density_score: 0 },
      insights: ['시군구 코드 매핑 실패로 분석을 생성하지 못했습니다.'],
      data_freshness: { business: null, sales: null, store: null },
      source: 'land-commercial-v1-fallback',
    }
  }

  const supabase = getSupabase()
  const [businessRowsAll, salesRowsAll, storeRowsAll, foot, districtChar, competition500m] =
    await Promise.all([
      fetchBusinessStats(supabase, districtCode),
      fetchSalesStats(supabase, districtCode),
      fetchStoreStats(supabase, districtCode),
      fetchFootTraffic(supabase, districtCode),
      fetchDistrictChar(supabase, districtCode),
      fetchCompetitionWithin500m({
        supabase,
        parcel: input.parcel,
        districtCode,
      }),
    ])

  const businessRows = latestByIndustry(businessRowsAll)
  const salesRows = latestByIndustry(salesRowsAll)
  const storeRows = latestByIndustry(storeRowsAll)

  const salesByIndustry = new Map<string, Record<string, unknown>>()
  for (const row of salesRows) {
    const code = String(row.industry_small_code || '')
    if (!code) continue
    salesByIndustry.set(code, row)
  }

  const storeByIndustry = new Map<string, Record<string, unknown>>()
  for (const row of storeRows) {
    const code = String(row.industry_small_code || '')
    if (!code) continue
    storeByIndustry.set(code, row)
  }

  const candidateIndustries: CandidateIndustry[] = businessRows
    .map((row) => {
      const industryCode = String(row.industry_small_code || '')
      if (!industryCode) return null

      const industryName = String(row.industry_name || industryCode)
      if (isExcludedIndustry(industryCode, industryName)) return null

      const sales = salesByIndustry.get(industryCode)
      const store = storeByIndustry.get(industryCode)

      const survivalRate = clamp(num(row.survival_rate), 0, 100)
      const monthlySales = Math.max(0, num(sales?.monthly_avg_sales))
      const salesGrowth = clamp(num(sales?.sales_growth_rate), -100, 200)
      const storeCount = Math.max(0, num(store?.store_count))
      const franchiseRatio = clamp(num(store?.franchise_ratio), 0, 1)
      const competitionRatio = clamp(storeCount / 30, 0, 20)

      return {
        industry_code: industryCode,
        industry_name: industryName,
        survival_rate: survivalRate,
        monthly_avg_sales: monthlySales,
        sales_growth_rate: salesGrowth,
        store_count: storeCount,
        franchise_ratio: franchiseRatio,
        competition_ratio: competitionRatio,
      }
    })
    .filter((row): row is CandidateIndustry => Boolean(row))
    .sort((a, b) => {
      const scoreA = a.survival_rate + Math.log10(a.monthly_avg_sales + 1) * 8
      const scoreB = b.survival_rate + Math.log10(b.monthly_avg_sales + 1) * 8
      return scoreB - scoreA
    })
    .slice(0, 12)

  const mlPredictions = await Promise.all(
    candidateIndustries.map(async (candidate) => {
      const ml = await callMlPredict({
        districtCode,
        industryCode: candidate.industry_code,
        overrides: candidate,
      })
      return { candidate, ml }
    })
  )

  const recommendationsFromMl: RecommendedIndustry[] = mlPredictions
    .filter(
      (row): row is { candidate: CandidateIndustry; ml: MlPredictResult } =>
        Boolean(row.ml)
    )
    .map(({ candidate, ml }) => ({
      industry_name: candidate.industry_name,
      industry_code: candidate.industry_code,
      success_probability: round1(clamp(ml.success_probability, 0, 100)),
      estimated_store_count: Math.round(candidate.store_count),
      factors: (ml.factors || [])
        .map((factor): CommercialFactor => {
          const direction: 'positive' | 'negative' =
            factor.direction === 'negative' ? 'negative' : 'positive'
          return {
            name: String(factor.name || '요인'),
            impact: round1(Math.abs(num(factor.impact))),
            direction,
          }
        })
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 3),
    }))
    .sort((a, b) => b.success_probability - a.success_probability)
    .slice(0, 5)

  const recommendationsFallback: RecommendedIndustry[] = candidateIndustries
    .slice(0, 5)
    .map((candidate) => {
      const score = round1(
        clamp(
          candidate.survival_rate * 0.6 +
            Math.log10(candidate.monthly_avg_sales + 1) * 12 +
            candidate.sales_growth_rate * 0.18 -
            candidate.competition_ratio * 3,
          5,
          95
        )
      )

      return {
        industry_name: candidate.industry_name,
        industry_code: candidate.industry_code,
        success_probability: score,
        estimated_store_count: Math.round(candidate.store_count),
        factors: [
          {
            name: '업종 생존율',
            impact: round1(Math.abs(candidate.survival_rate - 50) / 5),
            direction: candidate.survival_rate >= 50 ? 'positive' : 'negative',
          },
          {
            name: '월평균 매출',
            impact: round1(Math.log10(candidate.monthly_avg_sales + 1)),
            direction: candidate.monthly_avg_sales > 0 ? 'positive' : 'negative',
          },
          {
            name: '경쟁 점포수',
            impact: round1(candidate.competition_ratio),
            direction: candidate.competition_ratio <= 2 ? 'positive' : 'negative',
          },
        ],
      }
    })

  const recommendedIndustries =
    recommendationsFromMl.length > 0 ? recommendationsFromMl : recommendationsFallback

  const weekdayAvg = num(foot.weekday_avg)
  const weekendAvg = num(foot.weekend_avg)
  const dailyAvg = Math.round(
    weekdayAvg > 0 || weekendAvg > 0
      ? (weekdayAvg + weekendAvg) / 2
      : num(foot.total_foot_traffic)
  )

  const demographics = getDemographics(foot).slice(0, 4)
  const peakTime = getPeakTimeLabel(foot)

  const topAvg =
    recommendedIndustries.length > 0
      ? recommendedIndustries.reduce((sum, row) => sum + row.success_probability, 0) /
        recommendedIndustries.length
      : 0
  const footTrafficScore = round1(clamp(Math.log10(dailyAvg + 1) * 18 + 20, 20, 100))
  const commercialScore = round1(
    clamp(
      topAvg * 0.55 +
        footTrafficScore * 0.2 +
        competition500m.density_score * 0.25,
      0,
      100
    )
  )

  const insights: string[] = []
  if (recommendedIndustries[0]) {
    insights.push(
      `추천 1순위 업종은 ${recommendedIndustries[0].industry_name} (${recommendedIndustries[0].success_probability}%)입니다.`
    )
  }
  if (demographics[0]) {
    insights.push(`주요 유동 연령층은 ${demographics[0].age_group} (${demographics[0].percentage}%)입니다.`)
  }
  if (peakTime !== 'N/A') {
    insights.push(`유동인구 피크 시간대는 ${peakTime}입니다.`)
  }
  if (districtChar?.district_type) {
    insights.push(`상권 유형은 ${String(districtChar.district_type)} 중심입니다.`)
  }

  return {
    district_code: districtCode,
    district_name: districtName,
    commercial_score: commercialScore,
    recommended_industries: recommendedIndustries,
    foot_traffic: {
      daily_avg: dailyAvg,
      peak_time: peakTime,
      demographics,
    },
    competition: competition500m,
    insights: insights.slice(0, 4),
    data_freshness: {
      business:
        businessRowsAll.length > 0
          ? String(businessRowsAll[0].base_year_month || '')
          : null,
      sales:
        salesRowsAll.length > 0
          ? String(salesRowsAll[0].base_year_month || '')
          : null,
      store:
        storeRowsAll.length > 0
          ? String(storeRowsAll[0].base_year_month || '')
          : null,
    },
    source:
      recommendationsFromMl.length > 0
        ? 'land-commercial-v2-ml'
        : 'land-commercial-v1-fallback',
  }
}
