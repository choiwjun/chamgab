import 'server-only'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getDistrictName(
  supabase: SupabaseClient,
  sigunguCode: string
): Promise<{ name: string; sido: string }> {
  try {
    const { data } = await supabase
      .from('regions')
      .select('name, parent_code')
      .eq('level', 2)
      .like('code', `${sigunguCode}%`)
      .limit(1)

    if (!data?.[0]) return { name: sigunguCode, sido: '' }

    const { name, parent_code } = data[0]
    let sido = ''

    if (parent_code) {
      const { data: parent } = await supabase
        .from('regions')
        .select('name')
        .eq('code', parent_code)
        .limit(1)
      sido = parent?.[0]?.name || ''
    }

    return { name, sido }
  } catch {
    return { name: sigunguCode, sido: '' }
  }
}

export function fullName(name: string, sido: string): string {
  return sido ? `${sido} ${name}` : name
}

async function paginatedSelect(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string>,
  orderBy = 'base_year_month',
  maxRows = 3000
): Promise<Record<string, unknown>[]> {
  try {
    const all: Record<string, unknown>[] = []
    let offset = 0

    while (offset < maxRows) {
      let query = supabase.from(table).select('*')
      for (const [column, value] of Object.entries(filters)) {
        query = query.eq(column, value)
      }

      const { data } = await query
        .order(orderBy, { ascending: false })
        .range(offset, offset + 999)

      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < 1000) break
      offset += 1000
    }

    return all
  } catch {
    return []
  }
}

export async function fetchBusinessStats(
  supabase: SupabaseClient,
  sigunguCode: string,
  industryCode?: string
): Promise<Record<string, unknown>[]> {
  const filters: Record<string, string> = { sigungu_code: sigunguCode }
  if (industryCode) filters.industry_small_code = industryCode
  return paginatedSelect(supabase, 'business_statistics', filters)
}

export async function fetchSalesStats(
  supabase: SupabaseClient,
  sigunguCode: string,
  industryCode?: string
): Promise<Record<string, unknown>[]> {
  const filters: Record<string, string> = { sigungu_code: sigunguCode }
  if (industryCode) filters.industry_small_code = industryCode
  return paginatedSelect(supabase, 'sales_statistics', filters)
}

export async function fetchStoreStats(
  supabase: SupabaseClient,
  sigunguCode: string,
  industryCode?: string
): Promise<Record<string, unknown>[]> {
  const filters: Record<string, string> = { sigungu_code: sigunguCode }
  if (industryCode) filters.industry_small_code = industryCode
  return paginatedSelect(supabase, 'store_statistics', filters)
}

export async function fetchFootTraffic(
  supabase: SupabaseClient,
  sigunguCode: string
): Promise<Record<string, number>> {
  try {
    const { data } = await supabase
      .from('foot_traffic_statistics')
      .select('*')
      .eq('sigungu_code', sigunguCode)
      .order('base_year_quarter', { ascending: false })

    if (!data || data.length === 0) return {}
    if (data.length === 1) return data[0]

    const fields = [
      'time_00_06',
      'time_06_11',
      'time_11_14',
      'time_14_17',
      'time_17_21',
      'time_21_24',
      'age_10s',
      'age_20s',
      'age_30s',
      'age_40s',
      'age_50s',
      'age_60s_plus',
      'total_foot_traffic',
      'weekday_avg',
      'weekend_avg',
      'male_count',
      'female_count',
    ]

    const aggregated: Record<string, number> = {}
    for (const field of fields) {
      aggregated[field] = data.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)
    }
    return aggregated
  } catch {
    return {}
  }
}

export async function fetchDistrictChar(
  supabase: SupabaseClient,
  sigunguCode: string
): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase
      .from('district_characteristics')
      .select('*')
      .like('commercial_district_code', `${sigunguCode}%`)
      .order('base_year_quarter', { ascending: false })
      .limit(1)
    return data?.[0] || {}
  } catch {
    return {}
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

function weightedMean(
  rows: Record<string, unknown>[],
  field: string,
  weightBy: (row: Record<string, unknown>) => number
): number {
  let weightedSum = 0
  let weightSum = 0

  for (const row of rows) {
    const value = num(row[field], NaN)
    if (!Number.isFinite(value)) continue
    const weight = weightBy(row)
    if (!Number.isFinite(weight) || weight <= 0) continue

    weightedSum += value * weight
    weightSum += weight
  }

  return weightSum > 0 ? weightedSum / weightSum : 0
}

function weightedMode(
  rows: Record<string, unknown>[],
  field: string,
  weightBy: (row: Record<string, unknown>) => number
): string {
  const score = new Map<string, number>()
  for (const row of rows) {
    const key = String(row[field] || '').trim()
    if (!key) continue
    const weight = weightBy(row)
    if (!Number.isFinite(weight) || weight <= 0) continue
    score.set(key, (score.get(key) || 0) + weight)
  }

  let best = ''
  let bestScore = -1
  score.forEach((value, key) => {
    if (value > bestScore) {
      bestScore = value
      best = key
    }
  })
  return best
}

export async function fetchDistrictCharAggregated(
  supabase: SupabaseClient,
  sigunguCode: string,
  maxRows = 3000
): Promise<Record<string, unknown>> {
  try {
    const findLatestQuarter = async (table: string): Promise<string> => {
      try {
        const { data } = await supabase
          .from(table)
          .select('base_year_quarter')
          .like('commercial_district_code', `${sigunguCode}%`)
          .order('base_year_quarter', { ascending: false })
          .limit(1)
        return String(data?.[0]?.base_year_quarter || '')
      } catch {
        return ''
      }
    }

    let latestQuarter = await findLatestQuarter('district_characteristics')
    if (!latestQuarter) latestQuarter = await findLatestQuarter('work_population')
    if (!latestQuarter) latestQuarter = await findLatestQuarter('residential_population')
    if (!latestQuarter) latestQuarter = await findLatestQuarter('foot_traffic_statistics')
    if (!latestQuarter) return {}

    const { data: characteristicRows } = await supabase
      .from('district_characteristics')
      .select('*')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const rows = (characteristicRows || []) as Record<string, unknown>[]

    const { data: footRows } = await supabase
      .from('foot_traffic_statistics')
      .select('commercial_district_code,total_foot_traffic')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const weightMap = new Map<string, number>()
    for (const row of (footRows || []) as Record<string, unknown>[]) {
      const code = String(row.commercial_district_code || '')
      if (!code) continue
      const weight = num(row.total_foot_traffic, 0)
      if (weight > 0) weightMap.set(code, weight)
    }

    const weightBy = (row: Record<string, unknown>) => {
      const code = String(row.commercial_district_code || '')
      return weightMap.get(code) || 1
    }

    const districtType = rows.length ? weightedMode(rows, 'district_type', weightBy) : ''
    const primaryAgeGroup = rows.length ? weightedMode(rows, 'primary_age_group', weightBy) : ''
    const peakStart = rows.length ? weightedMode(rows, 'peak_time_start', weightBy) : ''
    const peakEnd = rows.length ? weightedMode(rows, 'peak_time_end', weightBy) : ''
    const consumptionLevel = rows.length ? weightedMode(rows, 'consumption_level', weightBy) : ''

    const studentRatio = clamp(
      rows.length ? weightedMean(rows, 'student_ratio', weightBy) : 0,
      0,
      100
    )

    const { data: workRows } = await supabase
      .from('work_population')
      .select('commercial_district_code,total_workers')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const { data: residentialRows } = await supabase
      .from('residential_population')
      .select('commercial_district_code,total_population')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const totalWorkers = (workRows || []).reduce(
      (sum, row: Record<string, unknown>) => sum + num(row.total_workers),
      0
    )
    const totalResidents = (residentialRows || []).reduce(
      (sum, row: Record<string, unknown>) => sum + num(row.total_population),
      0
    )

    let officeWorkerRatio = 0
    let residentRatio = 0
    if (totalWorkers > 0 || totalResidents > 0) {
      const denominator = totalWorkers + totalResidents || 1
      const officeShare = totalWorkers / denominator
      const residentShare = totalResidents / denominator
      const remaining = clamp(100 - studentRatio, 0, 100)
      officeWorkerRatio = remaining * officeShare
      residentRatio = remaining * residentShare
    } else {
      officeWorkerRatio = clamp(
        rows.length ? weightedMean(rows, 'office_worker_ratio', weightBy) : 0,
        0,
        100
      )
      residentRatio = clamp(100 - officeWorkerRatio - studentRatio, 0, 100)
    }

    const weekendSalesRatio = clamp(
      rows.length ? weightedMean(rows, 'weekend_sales_ratio', weightBy) : 0,
      0,
      100
    )
    const avgTicketPrice = Math.round(
      clamp(rows.length ? weightedMean(rows, 'avg_ticket_price', weightBy) : 0, 0, 1_000_000)
    )
    const peakTraffic = Math.round(
      clamp(rows.length ? weightedMean(rows, 'peak_time_traffic', weightBy) : 0, 0, 10_000_000)
    )

    const weekdayDominant =
      rows.length > 0
        ? (() => {
            let trueScore = 0
            let falseScore = 0
            for (const row of rows) {
              const weight = weightBy(row)
              if (!Number.isFinite(weight) || weight <= 0) continue
              if (Boolean(row.weekday_dominant)) trueScore += weight
              else falseScore += weight
            }
            return trueScore > falseScore
          })()
        : false

    let primaryAgeRatio = 0
    if (primaryAgeGroup) {
      let totalWeight = 0
      let matchedWeight = 0
      for (const row of rows) {
        const weight = weightBy(row)
        totalWeight += weight
        if (String(row.primary_age_group || '').trim() === primaryAgeGroup) {
          matchedWeight += weight
        }
      }
      primaryAgeRatio = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0
    }

    return {
      base_year_quarter: latestQuarter,
      district_type: districtType,
      primary_age_group: primaryAgeGroup,
      primary_age_ratio: Math.round(primaryAgeRatio * 10) / 10,
      office_worker_ratio: Math.round(officeWorkerRatio * 10) / 10,
      resident_ratio: Math.round(residentRatio * 10) / 10,
      student_ratio: Math.round(studentRatio * 10) / 10,
      peak_time_start: peakStart,
      peak_time_end: peakEnd,
      peak_time_traffic: peakTraffic,
      weekday_dominant: weekdayDominant,
      weekend_sales_ratio: Math.round(weekendSalesRatio * 10) / 10,
      avg_ticket_price: avgTicketPrice,
      consumption_level: consumptionLevel,
    }
  } catch {
    return {}
  }
}

export function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

export function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export function avg(
  rows: Record<string, unknown>[],
  field: string,
  fallback = 0
): number {
  if (!rows.length) return fallback
  const total = rows.reduce((sum, row) => sum + num(row[field]), 0)
  return total / rows.length
}

export function sum(rows: Record<string, unknown>[], field: string): number {
  return rows.reduce((acc, row) => acc + num(row[field]), 0)
}

export function latestByIndustry(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const industryCode = String(row.industry_small_code || '')
    if (!industryCode) continue
    const existing = map.get(industryCode)
    if (!existing || String(row.base_year_month || '') > String(existing.base_year_month || '')) {
      map.set(industryCode, row)
    }
  }
  return Array.from(map.values())
}

export function latestMonth(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (!rows.length) return rows
  const latest = rows.reduce((max, row) => {
    const ym = String(row.base_year_month || '')
    return ym > max ? ym : max
  }, '')
  if (!latest) return rows
  return rows.filter((row) => String(row.base_year_month || '') === latest)
}

const INDUSTRY_CATEGORY: Record<string, string> = {
  Q: '음식',
  D: '소매',
  R: '소매',
  N: '소매',
  I: '서비스',
  S: '서비스',
  L: '생활',
}

export function getIndustryCategory(code: string): string {
  if (!code) return '기타'
  return INDUSTRY_CATEGORY[code[0]] || '기타'
}

export const INDUSTRY_NAMES: Record<string, string> = {
  Q01: '한식 음식점',
  Q02: '중식 음식점',
  Q03: '일식 음식점',
  Q04: '양식 음식점',
  Q05: '기타 외국식 음식점',
  Q06: '치킨 전문점',
  Q07: '패스트푸드점',
  Q08: '분식 전문점',
  Q09: '호프/주점',
  Q10: '카페',
  Q11: '제과/베이커리',
  Q12: '커피 전문점',
  Q13: '디저트 카페',
  Q14: '아이스크림/빙수',
  Q15: '도시락/간편식',
  D01: '슈퍼마켓',
  D02: '편의점',
  D03: '정육점',
  D04: '수산물',
  D05: '반찬가게',
  R01: '의류/패션',
  R02: '신발/가방',
  R03: '화장품',
  R04: '꽃집/화원',
  R05: '문구/서점',
  N01: '약국',
  N02: '안경/콘택트렌즈',
  N03: '건강식품',
  I01: '미용실',
  I02: '네일/피부관리',
  I03: '세탁소',
  I04: '사진 스튜디오',
  I05: '인테리어/건축',
  I06: '부동산중개',
  S01: '학원/교습소',
  S02: '헬스/피트니스',
  S03: '노래방/오락',
  S04: '세차/자동차정비',
  S05: '반려동물/펫샵',
  S06: '코인세탁/빨래방',
  L01: '병원/의원',
  L02: '치과',
  L03: '한의원',
  L04: '어린이집/유치원',
  L05: '장례식장',
  L06: '주유소',
}

export function fallbackPredict(features: {
  survival_rate: number
  monthly_avg_sales: number
  sales_growth_rate: number
  store_count: number
  franchise_ratio: number
  competition_ratio: number
}): {
  success_probability: number
  confidence: number
  feature_contributions: {
    name: string
    importance: number
    direction: string
  }[]
} {
  const base = 10
  const survivalComp = (features.survival_rate / 100) * 35
  const salesComp = Math.min(
    Math.log10(Math.max(features.monthly_avg_sales, 5_000_000) / 5_000_000) * 12.5,
    20
  )
  const growthComp = Math.min(Math.max(features.sales_growth_rate * 2.5, -5), 15)
  const competitionComp = Math.min(Math.max((1 - features.competition_ratio) * 10, -10), 5)
  const franchiseComp = Math.min(features.franchise_ratio * 25, 8)
  const storeComp =
    features.store_count < 10
      ? 3
      : features.store_count < 30
        ? 5
        : features.store_count <= 300
          ? 8
          : 6

  const score =
    base +
    survivalComp +
    salesComp +
    growthComp +
    competitionComp +
    franchiseComp +
    storeComp
  const successProbability = Math.min(Math.max(score, 5), 95)

  const contributions = [
    {
      name: 'survival_rate',
      importance: Math.abs(survivalComp) / 100,
      direction: survivalComp >= 0 ? 'positive' : 'negative',
    },
    {
      name: 'monthly_avg_sales',
      importance: Math.abs(salesComp) / 100,
      direction: 'positive',
    },
    {
      name: 'sales_growth_rate',
      importance: Math.abs(growthComp) / 100,
      direction: growthComp >= 0 ? 'positive' : 'negative',
    },
    {
      name: 'competition_ratio',
      importance: Math.abs(competitionComp) / 100,
      direction: competitionComp >= 0 ? 'positive' : 'negative',
    },
    {
      name: 'franchise_ratio',
      importance: Math.abs(franchiseComp) / 100,
      direction: 'positive',
    },
    {
      name: 'store_count',
      importance: Math.abs(storeComp) / 100,
      direction: 'positive',
    },
  ]
  contributions.sort((a, b) => b.importance - a.importance)

  return {
    success_probability: Math.round(successProbability * 10) / 10,
    confidence: 55.0,
    feature_contributions: contributions.slice(0, 5),
  }
}

export function compressMlProbability(raw: number): number {
  const capped = Math.min(Math.max(raw, 0), 100)

  if (capped < 40) {
    return Math.round((40 - (40 - capped) * 0.75) * 10) / 10
  }
  if (capped < 70) {
    return Math.round((40 + (capped - 40) * 0.95) * 10) / 10
  }
  if (capped < 85) {
    return Math.round((68.5 + (capped - 70) * 0.7) * 10) / 10
  }
  return Math.round((79 + (capped - 85) * 0.6) * 10) / 10
}

export const EXCLUDED_INDUSTRY_CODES = [
  'L05',
  'L06',
  'L01',
  'L02',
  'L03',
  'L04',
  'I05',
  'I06',
]

export const EXCLUDED_INDUSTRY_NAMES = [
  '장례식장',
  '주유소',
  '병원',
  '의원',
  '치과',
  '한의원',
  '어린이집',
  '유치원',
  '인테리어',
  '부동산중개',
  '건축',
]

export function isExcludedIndustry(code: string, name: string): boolean {
  if (EXCLUDED_INDUSTRY_CODES.includes(code)) return true
  return EXCLUDED_INDUSTRY_NAMES.some((excluded) => name.includes(excluded))
}

export const FACTOR_NAME_MAP: Record<string, string> = {
  survival_rate: '업종 평균 생존율',
  survival_rate_normalized: '업종 평균 생존율(정규화)',
  monthly_avg_sales: '월평균 매출',
  monthly_avg_sales_log: '월평균 매출(로그)',
  sales_growth_rate: '매출 성장률',
  sales_per_store: '점포당 매출',
  sales_volatility: '매출 변동성',
  store_count: '점포 수',
  store_count_log: '점포 수(로그)',
  density_level: '밀집도',
  franchise_ratio: '프랜차이즈 비율',
  competition_ratio: '경쟁 강도',
  market_saturation: '시장 포화도',
  viability_index: '사업 지속 가능성',
  growth_potential: '성장 잠재력',
  foot_traffic_score: '유동인구 점수',
  peak_hour_ratio: '피크 시간 비율',
  weekend_ratio: '주말 매출 비중',
}
