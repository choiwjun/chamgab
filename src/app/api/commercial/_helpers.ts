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

export async function fetchBusinessStats(
  supabase: SupabaseClient,
  sigunguCode: string,
  industryCode?: string
): Promise<Record<string, unknown>[]> {
  try {
    let query = supabase
      .from('business_statistics')
      .select('*')
      .eq('sigungu_code', sigunguCode)
    if (industryCode) query = query.eq('industry_small_code', industryCode)
    const { data } = await query
    return data || []
  } catch {
    return []
  }
}

export async function fetchSalesStats(
  supabase: SupabaseClient,
  sigunguCode: string,
  industryCode?: string
): Promise<Record<string, unknown>[]> {
  try {
    let query = supabase
      .from('sales_statistics')
      .select('*')
      .eq('sigungu_code', sigunguCode)
    if (industryCode) query = query.eq('industry_small_code', industryCode)
    const { data } = await query
    return data || []
  } catch {
    return []
  }
}

export async function fetchStoreStats(
  supabase: SupabaseClient,
  sigunguCode: string,
  industryCode?: string
): Promise<Record<string, unknown>[]> {
  try {
    let query = supabase
      .from('store_statistics')
      .select('*')
      .eq('sigungu_code', sigunguCode)
    if (industryCode) query = query.eq('industry_small_code', industryCode)
    const { data } = await query
    return data || []
  } catch {
    return []
  }
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
      .eq('sigungu_code', sigunguCode)
      .limit(1)
    return data?.[0] || {}
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
