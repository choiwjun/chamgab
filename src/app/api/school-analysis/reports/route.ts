export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/app/api/_auth'
import type {
  AcademyEcosystem,
  DataQualitySummary,
  MetricProvenance,
  MetricValue,
  ProgressionStats,
  SchoolAnalysisReport,
  SchoolDataStatus,
  SchoolOverview,
  SchoolQualityScore,
} from '@/types/school-analysis'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createRequestHash,
  getSchoolAnalysisMode,
  normalizeDistrictCode,
  schoolApiError,
} from '../_helpers'

type CreateReportBody = {
  district_code?: string
}

class SchoolApiException extends Error {
  constructor(
    public code:
      | 'insufficient_official_data'
      | 'preview_only_mode'
      | 'pipeline_unavailable',
    message: string,
    public status: number
  ) {
    super(message)
  }
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round(v: number, p = 1) {
  const f = 10 ** p
  return Math.round(v * f) / f
}

function normalizedWeightedScore(
  values: Array<{ value: number | null; weight: number }>
): number | null {
  const valid = values.filter((item) => item.value !== null)
  if (valid.length === 0) return null

  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) return null

  const weighted = valid.reduce(
    (sum, item) => sum + (item.value as number) * item.weight,
    0
  )
  return round(weighted / totalWeight, 1)
}

function avg(rows: unknown[], field: string): number | null {
  const vals = rows
    .map((row) => asNumber((row as Record<string, unknown>)[field]))
    .filter((v): v is number => v !== null)
  if (vals.length === 0) return null
  return round(vals.reduce((s, v) => s + v, 0) / vals.length, 1)
}

function mv(
  value: number | null,
  provenance: MetricProvenance,
  unit = 'score',
  note?: string
): MetricValue {
  return {
    value,
    unit,
    provenance,
    availability: {
      available: value !== null,
      reason: value === null ? 'missing_source' : 'available',
      note,
    },
    updated_at: new Date().toISOString(),
  }
}

function isRecent(ts: string | null | undefined, maxDays: number): boolean {
  if (!ts) return false
  const parsed = Date.parse(ts)
  if (!Number.isFinite(parsed)) return false
  const ageMs = Date.now() - parsed
  return ageMs <= maxDays * 24 * 60 * 60 * 1000
}

function extractCoverage(preview: Record<string, unknown> | undefined): number {
  if (!preview) return 0
  const explicit = asNumber(preview.official_coverage_pct)
  if (explicit !== null) return explicit
  const fallback = asNumber(preview.official_confidence)
  return fallback ?? 0
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if ('response' in auth) return auth.response

  let body: CreateReportBody
  try {
    body = (await request.json()) as CreateReportBody
  } catch {
    const payload = schoolApiError('invalid_request', 'Invalid JSON body.', 400)
    return NextResponse.json(payload, { status: payload.status })
  }

  const districtCode = normalizeDistrictCode(body.district_code)
  const mode = getSchoolAnalysisMode()

  try {
    if (mode !== 'open') {
      throw new SchoolApiException(
        'preview_only_mode',
        'School analysis detail is temporarily limited to preview mode.',
        409
      )
    }

    const supabase = createAdminClient()
    const requestHash = createRequestHash({ districtCode, version: 'school_report_v2' })

    const { data: existingRow, error: existingError } = await supabase
      .from('school_analysis_reports')
      .select('id,report_payload,data_freshness')
      .eq('user_id', auth.userId)
      .eq('request_hash', requestHash)
      .maybeSingle()

    if (existingError) {
      throw new SchoolApiException(
        'pipeline_unavailable',
        `Report cache lookup failed: ${existingError.message}`,
        503
      )
    }

    const existingReport = existingRow?.report_payload as
      | SchoolAnalysisReport
      | undefined
    if (
      existingRow?.id &&
      existingReport &&
      isRecent(existingRow.data_freshness as string | null, 45)
    ) {
      return NextResponse.json({ report: existingReport, cached: true })
    }

    const { data: previewRows, error: previewError } = await supabase
      .from('vw_school_analysis_preview')
      .select('*')
      .eq('district_code', districtCode)
      .limit(1)

    if (previewError) {
      throw new SchoolApiException(
        'pipeline_unavailable',
        `Preview query failed: ${previewError.message}`,
        503
      )
    }

    const preview = previewRows?.[0] as Record<string, unknown> | undefined
    if (!preview) {
      throw new SchoolApiException(
        'insufficient_official_data',
        'No school preview data exists for this district.',
        409
      )
    }

    const officialCoverage = extractCoverage(preview)
    if (officialCoverage < 95) {
      throw new SchoolApiException(
        'insufficient_official_data',
        `Official coverage is too low (${officialCoverage.toFixed(1)}%).`,
        409
      )
    }

    const { data: schoolRows, error: schoolError } = await supabase
      .from('vw_school_quality_latest')
      .select('*')
      .eq('district_code', districtCode)

    if (schoolError) {
      throw new SchoolApiException(
        'pipeline_unavailable',
        `School quality query failed: ${schoolError.message}`,
        503
      )
    }

    const schools = (schoolRows || []) as Record<string, unknown>[]
    if (schools.length === 0) {
      throw new SchoolApiException(
        'insufficient_official_data',
        'No schools available for this district.',
        409
      )
    }

    const { data: academyRows, error: academyError } = await supabase
      .from('vw_academy_ecosystem_by_sigungu')
      .select('*')
      .eq('sigungu_code', districtCode)
      .limit(1)

    if (academyError) {
      throw new SchoolApiException(
        'pipeline_unavailable',
        `Academy ecosystem query failed: ${academyError.message}`,
        503
      )
    }

    const academy = (academyRows?.[0] || null) as Record<string, unknown> | null

    const schoolIds = schools
      .map((s) => String(s.school_id || ''))
      .filter((id) => id.length > 0)

    const { data: activeRows } =
      schoolIds.length > 0
        ? await supabase
            .from('schools')
            .select('school_id,is_active')
            .in('school_id', schoolIds.slice(0, 1000))
        : { data: [] }

    const activeMap = new Map<string, boolean>()
    for (const r of activeRows || []) {
      activeMap.set(String(r.school_id), Boolean(r.is_active ?? true))
    }

    const { data: metricsRows } =
      schoolIds.length > 0
        ? await supabase
            .from('school_metrics_official')
            .select('school_id,metrics')
            .in('school_id', schoolIds.slice(0, 1000))
            .order('metric_year', { ascending: false })
        : { data: [] }

    const officialSet = new Set<string>()
    for (const r of metricsRows || []) {
      const metrics = (r.metrics ?? {}) as Record<string, unknown>
      const hasOfficial =
        typeof metrics.schoolinfo_schul_code === 'string' ||
        typeof metrics.achievement_score === 'number' ||
        typeof metrics.progression_outcome_score === 'number'
      if (hasOfficial) {
        officialSet.add(String(r.school_id))
      }
    }

    const getDataStatus = (schoolId: string): SchoolDataStatus => {
      const isActive = activeMap.get(schoolId) ?? true
      if (!isActive) return 'inactive'
      if (officialSet.has(schoolId)) return 'official'
      return 'name_mismatch'
    }

    const totalSchools = schoolIds.length
    const inactiveCount = schoolIds.filter(
      (id) => !(activeMap.get(id) ?? true)
    ).length
    const officialCount = schoolIds.filter(
      (id) => officialSet.has(id) && (activeMap.get(id) ?? true)
    ).length
    const nameMismatchCount = totalSchools - officialCount - inactiveCount

    const dataQuality: DataQualitySummary = {
      total_schools: totalSchools,
      official_count: officialCount,
      name_mismatch_count: nameMismatchCount,
      inactive_count: inactiveCount,
      coverage_rate:
        totalSchools > 0 ? round((officialCount / totalSchools) * 100, 1) : 0,
    }

    if (dataQuality.coverage_rate < 95) {
      throw new SchoolApiException(
        'insufficient_official_data',
        `District official coverage too low (${dataQuality.coverage_rate.toFixed(1)}%).`,
        409
      )
    }

    const avgAchievement = avg(schools, 'achievement_score')
    const avgProgression = avg(schools, 'progression_outcome_score')
    const avgEnvironment = avg(schools, 'education_environment_score')
    const avgSafety = avg(schools, 'safety_life_score')
    const avgPrograms = avg(schools, 'program_score')

    const qualityOverall = normalizedWeightedScore([
      { value: avgAchievement, weight: 0.3 },
      { value: avgProgression, weight: 0.25 },
      { value: avgEnvironment, weight: 0.15 },
      { value: avgSafety, weight: 0.15 },
      { value: avgPrograms, weight: 0.15 },
    ])

    const schoolQuality: SchoolQualityScore = {
      overall: mv(qualityOverall, 'official'),
      achievement: mv(avgAchievement, 'official'),
      progression_outcome: mv(avgProgression, 'official'),
      education_environment: mv(avgEnvironment, 'official'),
      safety_life: mv(avgSafety, 'official'),
      programs: mv(avgPrograms, 'inferred'),
    }

    const avgGeneral = avg(schools, 'general_highschool_rate')
    const avgSpecial = avg(schools, 'special_purpose_highschool_rate')
    const avgAutonomy = avg(schools, 'autonomy_highschool_rate')
    const avgCollege = avg(schools, 'college_progression_rate')

    const progression: ProgressionStats = {
      general_highschool_rate: mv(avgGeneral, 'inferred', '%'),
      special_purpose_highschool_rate: mv(avgSpecial, 'inferred', '%'),
      autonomy_highschool_rate: mv(avgAutonomy, 'inferred', '%'),
      college_progression_rate: mv(avgCollege, 'inferred', '%'),
    }

    const density = academy ? asNumber(academy.density_score) : null
    const diversity = academy ? asNumber(academy.subject_diversity_score) : null
    const accessibility = academy ? asNumber(academy.accessibility_score) : null
    const feeAfford = academy ? asNumber(academy.fee_affordability_score) : null

    const academyOverall = normalizedWeightedScore([
      { value: density, weight: 0.35 },
      { value: diversity, weight: 0.25 },
      { value: accessibility, weight: 0.2 },
      { value: feeAfford, weight: 0.2 },
    ])

    const academyEcosystem: AcademyEcosystem = {
      overall: mv(academyOverall, 'inferred'),
      density: mv(density, 'official'),
      subject_diversity: mv(diversity, 'inferred'),
      accessibility: mv(accessibility, 'inferred'),
      fee_affordability: mv(feeAfford, 'official'),
    }

    const commuteSafetyScore = asNumber(preview.commute_safety_score)
    const commuteSafety = mv(commuteSafetyScore, 'inferred')

    const overallScore = normalizedWeightedScore([
      { value: qualityOverall, weight: 0.45 },
      { value: academyOverall, weight: 0.35 },
      { value: commuteSafetyScore, weight: 0.2 },
    ])

    const officialConf = asNumber(preview.official_confidence) ?? 0
    const inferredConf = asNumber(preview.inferred_confidence) ?? 0
    const totalConf = asNumber(preview.confidence_score) ?? 0

    const schoolList: SchoolOverview[] = schools.slice(0, 50).map((s) => {
      const score = normalizedWeightedScore([
        { value: asNumber(s.achievement_score), weight: 0.3 },
        { value: asNumber(s.progression_outcome_score), weight: 0.25 },
        { value: asNumber(s.education_environment_score), weight: 0.15 },
        { value: asNumber(s.safety_life_score), weight: 0.15 },
        { value: asNumber(s.program_score), weight: 0.15 },
      ])

      const schoolId = String(s.school_id || '')
      return {
        school_id: schoolId,
        school_name: String(s.school_name || `School ${schoolId}`),
        school_level: (String(s.school_level || 'other') as
          | 'elementary'
          | 'middle'
          | 'high'
          | 'other'),
        overall_score: mv(score, 'official'),
        data_status: getDataStatus(schoolId),
      }
    })

    const reportId = existingRow?.id || crypto.randomUUID()
    const districtName = String(preview.district_name || `District ${districtCode}`)

    const report: SchoolAnalysisReport = {
      id: reportId,
      user_id: auth.userId,
      district_code: districtCode,
      district_name: districtName,
      generated_at: new Date().toISOString(),
      data_freshness:
        (preview.data_freshness as string | null) || new Date().toISOString(),
      confidence_score: totalConf,
      confidence_breakdown: {
        official_confidence: officialConf,
        inferred_confidence: inferredConf,
        total_confidence: totalConf,
        formula_version: String(preview.formula_version || 'v2.0.0'),
      },
      overall_score: mv(overallScore, 'inferred'),
      school_quality: schoolQuality,
      progression,
      academy_ecosystem: academyEcosystem,
      commute_safety: commuteSafety,
      schools: schoolList,
      data_quality: dataQuality,
    }

    if (existingRow?.id) {
      const { error: updateError } = await supabase
        .from('school_analysis_reports')
        .update({
          district_name: districtName,
          report_payload: report,
          data_freshness: report.data_freshness,
          confidence_score: report.confidence_score,
          formula_version: report.confidence_breakdown.formula_version,
        })
        .eq('id', existingRow.id)

      if (updateError) {
        throw new SchoolApiException(
          'pipeline_unavailable',
          `Failed to update report cache: ${updateError.message}`,
          503
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('school_analysis_reports')
        .insert({
          id: reportId,
          user_id: auth.userId,
          district_code: districtCode,
          district_name: districtName,
          request_hash: requestHash,
          report_payload: report,
          data_freshness: report.data_freshness,
          confidence_score: report.confidence_score,
          formula_version: report.confidence_breakdown.formula_version,
        })

      if (insertError) {
        throw new SchoolApiException(
          'pipeline_unavailable',
          `Failed to save report cache: ${insertError.message}`,
          503
        )
      }
    }

    return NextResponse.json({ report, cached: false }, { status: 201 })
  } catch (err) {
    if (err instanceof SchoolApiException) {
      const payload = schoolApiError(err.code, err.message, err.status)
      return NextResponse.json(payload, { status: err.status })
    }

    const payload = schoolApiError(
      'pipeline_unavailable',
      'School analysis pipeline unavailable.',
      503
    )
    return NextResponse.json(payload, { status: payload.status })
  }
}
