export type QualityGateStatus = 'pass' | 'warn' | 'fail'

export type QualityGrade = 'A' | 'B' | 'C' | 'D'

export type QualityFreshness = string | null | object

export interface QualityMeta {
  quality_gate_status: QualityGateStatus
  quality_grade: QualityGrade
  quality_flags: string[]
  data_freshness: QualityFreshness
  quality_version: string
}
