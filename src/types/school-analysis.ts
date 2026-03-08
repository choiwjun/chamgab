import type { QualityMeta } from './quality'

export type MetricProvenance = 'official' | 'inferred'
export type SchoolAnalysisMode = 'preview_only' | 'open'
export type ApiErrorCode =
  | 'insufficient_credits'
  | 'insufficient_official_data'
  | 'preview_only_mode'
  | 'report_not_found'
  | 'school_not_found'
  | 'pipeline_unavailable'
  | 'invalid_request'

export type SchoolDataStatus = 'official' | 'name_mismatch' | 'inactive'
export type QualityFlag =
  | 'insufficient_official_data'
  | 'high_inferred_ratio'
  | 'stale_data'
  | 'low_coverage'
  | 'missing_metrics'

export interface DataQualitySummary {
  total_schools: number
  official_count: number
  name_mismatch_count: number
  inactive_count: number
  coverage_rate: number
}

export type AvailabilityReason =
  | 'available'
  | 'missing_source'
  | 'outdated'
  | 'low_coverage'
  | 'policy_restricted'

export type SchoolLevel = 'elementary' | 'middle' | 'high' | 'other'

export interface AvailabilityBlock {
  available: boolean
  reason: AvailabilityReason
  note?: string
}

export interface MetricValue {
  value: number | null
  unit?: string
  provenance: MetricProvenance
  availability: AvailabilityBlock
  updated_at?: string
}

export interface ConfidenceBreakdown {
  official_confidence: number
  inferred_confidence: number
  total_confidence: number
  formula_version: string
}

export interface SchoolQualityScore {
  overall: MetricValue
  achievement: MetricValue
  progression_outcome: MetricValue
  education_environment: MetricValue
  safety_life: MetricValue
  programs: MetricValue
}

export interface ProgressionStats {
  general_highschool_rate: MetricValue
  special_purpose_highschool_rate: MetricValue
  autonomy_highschool_rate: MetricValue
  college_progression_rate: MetricValue
}

export interface AcademyEcosystem {
  overall: MetricValue
  density: MetricValue
  subject_diversity: MetricValue
  accessibility: MetricValue
  fee_affordability: MetricValue
}

export interface SchoolDistrictSummary {
  district_code: string
  district_name: string
  school_count: number
  overall_score: MetricValue
  data_freshness: string
  confidence_score: number
  confidence_breakdown: ConfidenceBreakdown
  quality?: DistrictQuality
  insights: SchoolDistrictInsights
}

export interface DistrictQuality {
  official_coverage_pct: number
  inferred_ratio_pct: number
  flags: QualityFlag[]
}

export type SchoolDistrictGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface SchoolLevelBreakdown {
  elementary: number
  middle: number
  high: number
  other: number
}

export interface SchoolDistrictInsights {
  rank: number | null
  grade: SchoolDistrictGrade
  college_progression_rate: number | null
  special_purpose_highschool_rate: number | null
  autonomy_highschool_rate: number | null
  school_level_breakdown: SchoolLevelBreakdown
  academy_count: number | null
  academy_avg_monthly_fee: number | null
  college_progression_estimated: boolean
  academy_fee_estimated: boolean
  academy_fee_reliability: 'ok' | 'low'
}

export interface SchoolReadinessMeta {
  mode: SchoolAnalysisMode
  quality_version: string
  readiness: 'go' | 'hold'
}

export interface SchoolOverview {
  school_id: string
  school_name: string
  school_level: SchoolLevel
  overall_score: MetricValue
  data_status?: SchoolDataStatus
}

export interface SchoolAnalysisReport {
  id: string
  user_id: string | null
  district_code: string
  district_name: string
  generated_at: string
  data_freshness: string
  confidence_score: number
  confidence_breakdown: ConfidenceBreakdown
  overall_score: MetricValue
  school_quality: SchoolQualityScore
  progression: ProgressionStats
  academy_ecosystem: AcademyEcosystem
  commute_safety: MetricValue
  schools: SchoolOverview[]
  data_quality?: DataQualitySummary
}

export interface SchoolDetail {
  school_id: string
  school_name: string
  school_level: SchoolLevel
  district_code: string
  district_name: string
  address: string
  location: {
    lat: number
    lng: number
  } | null
  data_freshness: string
  official_reference_year?: number | null
  confidence_breakdown: ConfidenceBreakdown
  quality: SchoolQualityScore
  progression: ProgressionStats
  data_status?: SchoolDataStatus
  is_active?: boolean
}

export interface SchoolPreviewParams {
  district_code?: string
  limit?: number
}

export interface SchoolPreviewResponse {
  items: SchoolDistrictSummary[]
  generated_at: string
  meta: SchoolReadinessMeta
}

export interface CreateSchoolReportParams {
  district_code: string
  school_ids?: string[]
}

export interface SchoolReportResponse extends QualityMeta {
  report: SchoolAnalysisReport
  cached: boolean
}
