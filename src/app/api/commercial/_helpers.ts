/**
 * 상권분석 API 공통 Supabase 헬퍼
 *
 * ML API(HuggingFace) 의존성을 제거하고 Supabase 직접 조회로 전환.
 * Python commercial.py의 헬퍼 함수들을 TypeScript로 포팅.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Supabase 클라이언트
// ============================================================================

export function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// ============================================================================
// 시군구 이름 조회
// ============================================================================

export async function getDistrictName(
  supabase: SupabaseClient,
  sigunguCode: string
): Promise<{ name: string; sido: string }> {
  try {
    const { data } = await supabase
      .from('regions')
      .select('name, parent_code')
      .like('code', `${sigunguCode}%`)
      .eq('level', 2)
      .limit(1)

    if (!data?.[0]) return { name: sigunguCode, sido: '' }

    const { name, parent_code } = data[0]
    let sido = ''
    if (parent_code) {
      const { data: sidoData } = await supabase
        .from('regions')
        .select('name')
        .eq('code', parent_code)
        .limit(1)
      sido = sidoData?.[0]?.name || ''
    }
    return { name, sido }
  } catch {
    return { name: sigunguCode, sido: '' }
  }
}

export function fullName(name: string, sido: string): string {
  return sido ? `${sido} ${name}` : name
}

// ============================================================================
// 테이블별 데이터 조회
// ============================================================================

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
      for (const [col, val] of Object.entries(filters)) {
        query = query.eq(col, val)
      }
      query = query
        .order(orderBy, { ascending: false })
        .range(offset, offset + 999)
      const { data } = await query
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

    // 여러 상권이면 합산
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
    const agg: Record<string, number> = {}
    for (const field of fields) {
      agg[field] = data.reduce((sum, row) => sum + (Number(row[field]) || 0), 0)
    }
    return agg
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
  let wsum = 0
  let vsum = 0
  for (const r of rows) {
    const v = num(r[field], NaN)
    if (!isFinite(v)) continue
    const w = weightBy(r)
    if (!isFinite(w) || w <= 0) continue
    wsum += w
    vsum += w * v
  }
  return wsum > 0 ? vsum / wsum : 0
}

function weightedMode(
  rows: Record<string, unknown>[],
  field: string,
  weightBy: (row: Record<string, unknown>) => number
): string {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = String(r[field] || '').trim()
    if (!key) continue
    const w = weightBy(r)
    if (!isFinite(w) || w <= 0) continue
    map.set(key, (map.get(key) || 0) + w)
  }
  let best = ''
  let bestW = -1
  map.forEach((w, k) => {
    if (w > bestW) {
      bestW = w
      best = k
    }
  })
  return best
}

/**
 * 시군구 코드(5자리) 기준으로 district_characteristics를 "최신 분기"로 모아 집계.
 * - 숫자: 유동인구(total_foot_traffic) 가중 평균
 * - 범주: 유동인구 가중 최빈값
 *
 * 목적: 시군구 단위 화면에서 임의 1개 상권 샘플이 대표처럼 보이는 문제를 완화.
 */
export async function fetchDistrictCharAggregated(
  supabase: SupabaseClient,
  sigunguCode: string,
  maxRows = 3000
): Promise<Record<string, unknown>> {
  try {
    // 1) 최신 분기 찾기 (문자열 내림차순이 최신으로 동작한다는 가정: YYYYQQ)
    // district_characteristics가 비어있을 수 있으니 다른 테이블로 fallback.
    const findLatestQuarter = async (table: string): Promise<string> => {
      try {
        const { data } = await supabase
          .from(table)
          .select('base_year_quarter')
          .like('commercial_district_code', `${sigunguCode}%`)
          .order('base_year_quarter', { ascending: false })
          .limit(1)
        return (data?.[0]?.base_year_quarter as string) || ''
      } catch {
        return ''
      }
    }

    let latestQuarter = await findLatestQuarter('district_characteristics')
    if (!latestQuarter)
      latestQuarter = await findLatestQuarter('work_population')
    if (!latestQuarter)
      latestQuarter = await findLatestQuarter('residential_population')
    if (!latestQuarter)
      latestQuarter = await findLatestQuarter('foot_traffic_statistics')
    if (!latestQuarter) return {}

    // 2) 최신 분기의 모든 상권 특성 행
    const { data: rows } = await supabase
      .from('district_characteristics')
      .select('*')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const charRows = (rows || []) as Record<string, unknown>[]

    // 3) 같은 분기의 유동인구 행을 weight로 사용
    const { data: footRows } = await supabase
      .from('foot_traffic_statistics')
      .select('commercial_district_code,total_foot_traffic')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const weightMap = new Map<string, number>()
    for (const r of (footRows || []) as Record<string, unknown>[]) {
      const cd = String(r.commercial_district_code || '')
      if (!cd) continue
      const w = num(r.total_foot_traffic, 0)
      if (w > 0) weightMap.set(cd, w)
    }

    const weightBy = (r: Record<string, unknown>) => {
      const cd = String(r.commercial_district_code || '')
      return weightMap.get(cd) || 1
    }

    const districtType = charRows.length
      ? weightedMode(charRows, 'district_type', weightBy)
      : ''
    const primaryAgeGroup = charRows.length
      ? weightedMode(charRows, 'primary_age_group', weightBy)
      : ''
    const peakStart = charRows.length
      ? weightedMode(charRows, 'peak_time_start', weightBy)
      : ''
    const peakEnd = charRows.length
      ? weightedMode(charRows, 'peak_time_end', weightBy)
      : ''
    const consumptionLevel = charRows.length
      ? weightedMode(charRows, 'consumption_level', weightBy)
      : ''

    // student_ratio는 별도 실측 테이블이 없으므로 district_characteristics 기반(있으면)만 사용.
    // office/resident는 work/residential 실측이 있으면 그 비율을 사용하고, 없으면 char 기반으로 fallback.
    const studentRatio = clamp(
      charRows.length ? weightedMean(charRows, 'student_ratio', weightBy) : 0,
      0,
      100
    )

    // 3.5) 실측 인구(직장/주거) 집계
    const { data: workRows } = await supabase
      .from('work_population')
      .select('commercial_district_code,total_workers')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const { data: resRows } = await supabase
      .from('residential_population')
      .select('commercial_district_code,total_population')
      .like('commercial_district_code', `${sigunguCode}%`)
      .eq('base_year_quarter', latestQuarter)
      .range(0, maxRows - 1)

    const totalWorkers = (workRows || []).reduce(
      (s: number, r: Record<string, unknown>) => s + num(r.total_workers),
      0
    )
    const totalResidents = (resRows || []).reduce(
      (s: number, r: Record<string, unknown>) => s + num(r.total_population),
      0
    )

    let officeWorkerRatio = 0
    let residentRatio = 0

    if (totalWorkers > 0 || totalResidents > 0) {
      // 실측 비율(직장/주거)을 (100 - student) 안에서 비례 배분해서 합이 100이 되게 맞춤
      const denom = totalWorkers + totalResidents || 1
      const officeShare = totalWorkers / denom
      const residentShare = totalResidents / denom
      const remaining = clamp(100 - studentRatio, 0, 100)
      officeWorkerRatio = remaining * officeShare
      residentRatio = remaining * residentShare
    } else {
      const officeFromChar = clamp(
        charRows.length
          ? weightedMean(charRows, 'office_worker_ratio', weightBy)
          : 0,
        0,
        100
      )
      officeWorkerRatio = officeFromChar
      residentRatio = clamp(100 - officeWorkerRatio - studentRatio, 0, 100)
    }

    const weekendSalesRatio = clamp(
      charRows.length
        ? weightedMean(charRows, 'weekend_sales_ratio', weightBy)
        : 0,
      0,
      100
    )

    const avgTicketPrice = Math.round(
      clamp(
        charRows.length
          ? weightedMean(charRows, 'avg_ticket_price', weightBy)
          : 0,
        0,
        1_000_000
      )
    )

    const peakTraffic = Math.round(
      clamp(
        charRows.length
          ? weightedMean(charRows, 'peak_time_traffic', weightBy)
          : 0,
        0,
        10_000_000
      )
    )

    // 가중 최빈값으로 주중 우세 여부도 결정 (동률이면 false)
    const weekdayDominant =
      (charRows.length
        ? (() => {
            let t = 0
            let f = 0
            for (const r of charRows) {
              const v = r.weekday_dominant
              if (v == null) continue
              const w = weightBy(r)
              if (!isFinite(w) || w <= 0) continue
              if (Boolean(v)) t += w
              else f += w
            }
            return t > f
          })()
        : false) || false

    // primary_age_ratio: 선택된 primary_age_group의 가중 비중(%) 추정
    let primaryAgeRatio = 0
    if (primaryAgeGroup) {
      let wAll = 0
      let wHit = 0
      for (const r of charRows) {
        const w = weightBy(r)
        wAll += w
        if (String(r.primary_age_group || '').trim() === primaryAgeGroup)
          wHit += w
      }
      primaryAgeRatio = wAll > 0 ? (wHit / wAll) * 100 : 0
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

// ============================================================================
// 유틸리티
// ============================================================================

/** 안전한 숫자 변환 */
export function num(val: unknown, fallback = 0): number {
  const n = Number(val)
  return isNaN(n) ? fallback : n
}

/** 안전한 평균 */
export function avg(
  rows: Record<string, unknown>[],
  field: string,
  fallback = 0
): number {
  if (!rows.length) return fallback
  const sum = rows.reduce((s, r) => s + num(r[field]), 0)
  return sum / rows.length
}

/** 안전한 합계 */
export function sum(rows: Record<string, unknown>[], field: string): number {
  return rows.reduce((s, r) => s + num(r[field]), 0)
}

/** 업종별 최신 월 데이터만 추출 (24개월 중복 제거) */
export function latestByIndustry(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const r of rows) {
    const ic = String(r.industry_small_code || '')
    if (!ic) continue
    const existing = map.get(ic)
    if (
      !existing ||
      String(r.base_year_month || '') > String(existing.base_year_month || '')
    ) {
      map.set(ic, r)
    }
  }
  return Array.from(map.values())
}

/** 최신 월 데이터만 필터 (전체 행에서 최신 base_year_month만) */
export function latestMonth(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (!rows.length) return rows
  const latest = rows.reduce((max, r) => {
    const ym = String(r.base_year_month || '')
    return ym > max ? ym : max
  }, '')
  return latest
    ? rows.filter((r) => String(r.base_year_month) === latest)
    : rows
}

// ============================================================================
// 업종 카테고리 매핑
// ============================================================================

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

/** 업종코드 → 한글명 (static fallback) */
export const INDUSTRY_NAMES: Record<string, string> = {
  Q01: '한식음식점',
  Q02: '중식음식점',
  Q03: '일식음식점',
  Q04: '서양식음식점',
  Q05: '기타외국식음식점',
  Q06: '치킨전문점',
  Q07: '패스트푸드점',
  Q08: '분식전문점',
  Q09: '호프/간이주점',
  Q10: '제과점',
  Q11: '피자/햄버거/샌드위치',
  Q12: '커피전문점',
  Q13: '카페',
  Q14: '아이스크림/빙수',
  Q15: '도시락/밥집',
  D01: '슈퍼마켓',
  D02: '편의점',
  D03: '농수산물',
  D04: '정육점',
  D05: '반찬가게',
  R01: '의류/패션',
  R02: '신발/가방',
  R03: '화장품',
  R04: '꽃집/화원',
  R05: '문구/팬시',
  N01: '약국',
  N02: '안경/콘택트렌즈',
  N03: '건강식품',
  I01: '미용실',
  I02: '네일아트/피부관리',
  I03: '세탁소',
  I04: '사진스튜디오',
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

// ============================================================================
// 규칙 기반 예측 (ML 모델 없이)
// ============================================================================

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
  let score = 0
  score += features.survival_rate * 0.4
  score += Math.min(features.sales_growth_rate * 5, 20)
  score += Math.max(20 - features.competition_ratio * 10, 0)
  score += features.franchise_ratio * 20

  const success_probability = Math.min(Math.max(score, 0), 100)

  return {
    success_probability: Math.round(success_probability * 10) / 10,
    confidence: 60.0,
    feature_contributions: [
      { name: 'survival_rate', importance: 0.4, direction: 'positive' },
      { name: 'sales_growth_rate', importance: 0.2, direction: 'positive' },
      { name: 'competition_ratio', importance: 0.2, direction: 'negative' },
      { name: 'franchise_ratio', importance: 0.2, direction: 'positive' },
    ],
  }
}

/** 창업 추천에서 제외할 업종 (비상업/시설 업종) */
export const EXCLUDED_INDUSTRY_CODES = [
  'L05', // 장례식장
  'L06', // 주유소
  'L01', // 병원/의원
  'L02', // 치과
  'L03', // 한의원
  'L04', // 어린이집/유치원
  'I05', // 인테리어/건축
  'I06', // 부동산중개
]

/** 이름 기반 백업 필터 (코드 매칭 실패 시 방어) */
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

/** 업종이 창업 추천에서 제외 대상인지 확인 (코드 + 이름 이중 필터) */
export function isExcludedIndustry(code: string, name: string): boolean {
  if (EXCLUDED_INDUSTRY_CODES.includes(code)) return true
  return EXCLUDED_INDUSTRY_NAMES.some((n) => name.includes(n))
}

/** 피처 이름 → 한글 매핑 */
export const FACTOR_NAME_MAP: Record<string, string> = {
  survival_rate: '생존율',
  survival_rate_normalized: '생존율(정규화)',
  monthly_avg_sales: '월평균 매출',
  monthly_avg_sales_log: '월평균 매출(로그)',
  sales_growth_rate: '매출 증가율',
  sales_per_store: '점포당 매출',
  sales_volatility: '매출 변동성',
  store_count: '점포 수',
  store_count_log: '점포 수(로그)',
  density_level: '밀집도',
  franchise_ratio: '프랜차이즈 비율',
  competition_ratio: '경쟁도',
  market_saturation: '시장 포화도',
  viability_index: '사업 생존 가능성',
  growth_potential: '성장 잠재력',
  foot_traffic_score: '유동인구 점수',
  peak_hour_ratio: '피크 시간 비율',
  weekend_ratio: '주말 비율',
}
