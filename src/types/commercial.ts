/**
 * 상권분석 API 타입 정의
 */

// 기본 타입
export interface DistrictBasic {
  code: string
  name: string
  description: string
  sido?: string
  has_data?: boolean
}

export interface Industry {
  code: string
  name: string
  category: string
  description?: string
  has_data?: boolean
}

// 상권 통계
export interface DistrictStatistics {
  total_stores: number
  survival_rate: number
  monthly_avg_sales: number
  sales_growth_rate: number
  competition_ratio: number
}

export interface DistrictDetail {
  code: string
  name: string
  description: string
  statistics: DistrictStatistics
}

// 예측 요인
export interface PredictionFactor {
  name: string
  impact: number
  direction: 'positive' | 'negative' | 'neutral'
}

// 창업 성공 예측 결과
export interface BusinessPredictionResult {
  success_probability: number
  confidence: number
  factors: PredictionFactor[]
  recommendation: string
  source?: 'ml_model' | 'rule_based'

  // Diagnostics (present on rule-based fallback; used to explain "왜 60%인가")
  ml_status?:
    | 'not_configured'
    | 'timeout'
    | 'http_error'
    | 'incompatible'
    | 'invalid_shape'
    | 'exception'
  ml_http_status?: number | null
  ml_detail?: string | null
  data_coverage?: {
    business_rows: number
    sales_rows: number
    store_rows: number
  }
}

// 지역 비교
export interface RegionComparison {
  district_code: string
  district_name: string
  success_probability: number
  ranking: number
}

export interface RegionComparisonResult {
  comparisons: RegionComparison[]
}

// 업종 통계
export interface TopRegion {
  district_code: string
  district_name: string
  success_probability: number
}

export interface IndustryStatistics {
  industry_code: string
  industry_name: string
  total_stores: number
  avg_survival_rate: number
  avg_monthly_sales: number
  top_regions: TopRegion[]
}

// 트렌드 데이터
export interface TrendData {
  period: string
  sales: number
  store_count: number
  open_count: number
  close_count: number
}

export interface BusinessTrends {
  district_code: string
  industry_code: string
  trends: TrendData[]
}

// 시간대별 유동인구
export interface TimeSlotTraffic {
  time_slot: string
  traffic_count: number
  percentage: number
}

// 연령대별 분포
export interface AgeGroupDistribution {
  age_group: string
  count: number
  percentage: number
}

// 상권 특성 분석
export interface DistrictCharacteristics {
  district_code: string
  district_name: string
  district_type: string

  // 타겟 고객
  primary_age_group: string
  primary_age_ratio: number

  // 인구 특성
  office_worker_ratio: number
  resident_ratio: number
  student_ratio: number

  // 시간대 특성
  peak_time_start: string
  peak_time_end: string
  peak_time_traffic: number
  time_distribution: TimeSlotTraffic[]

  // 연령대 분포
  age_distribution: AgeGroupDistribution[]

  // 소비 특성
  avg_ticket_price: number
  consumption_level: string

  // 요일 특성
  weekday_dominant: boolean
  weekend_sales_ratio: number

  // 추천
  recommended_business_hours: string
  target_customer_profile: string
}
