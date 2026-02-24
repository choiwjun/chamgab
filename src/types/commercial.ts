/**
 * 상권분석 API 타입 정의
 */

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

export interface PredictionFactor {
  name: string
  impact: number
  direction: 'positive' | 'negative' | 'neutral'
}

export interface CommercialDataFreshness {
  business: string | null
  sales: string | null
  store: string | null
}

export interface CommercialConfidenceBreakdown {
  coverage: number
  recency: number
  model: number
  calibration_penalty: number
  policy_penalty?: number
  industry_fit_penalty?: number
  industry_fit_adjustment?: number
}

export interface BusinessPredictionResult {
  success_probability: number
  raw_success_probability?: number
  confidence: number
  model_confidence?: number
  confidence_breakdown?: CommercialConfidenceBreakdown
  calibration_version?: string
  quality_flags?: string[]
  quality_version?: string
  data_freshness?: CommercialDataFreshness
  factors: PredictionFactor[]
  recommendation: string
  source?: 'ml_model' | 'rule_based'

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

export interface RegionComparison {
  district_code: string
  district_name: string
  success_probability: number
  ranking: number
}

export interface RegionComparisonResult {
  comparisons: RegionComparison[]
}

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

export interface TimeSlotTraffic {
  time_slot: string
  traffic_count: number
  percentage: number
}

export interface AgeGroupDistribution {
  age_group: string
  count: number
  percentage: number
}

export interface DistrictCharacteristics {
  district_code: string
  district_name: string
  district_type: string
  primary_age_group: string
  primary_age_ratio: number
  office_worker_ratio: number
  resident_ratio: number
  student_ratio: number
  peak_time_start: string
  peak_time_end: string
  peak_time_traffic: number
  time_distribution: TimeSlotTraffic[]
  age_distribution: AgeGroupDistribution[]
  avg_ticket_price: number
  consumption_level: string
  weekday_dominant: boolean
  weekend_sales_ratio: number
  recommended_business_hours: string
  target_customer_profile: string
}
