export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiUser } from '@/app/api/_auth'
import type {
  MetricProvenance,
  MetricValue,
  ProgressionStats,
  SchoolDataStatus,
  SchoolDetail,
  SchoolLevel,
  SchoolQualityScore,
} from '@/types/school-analysis'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSchoolAnalysisMode, schoolApiError } from '../../_helpers'

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

function round(v: number, p = 1) {
  const f = 10 ** p
  return Math.round(v * f) / f
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function sanitizeScore(value: unknown): number | null {
  const n = asNumber(value)
  if (n === null) return null
  if (n <= 0) return null
  return round(n, 1)
}

function resolveOfficialCollegeRateFromMetrics(
  metrics: Record<string, number | string | null>
): number | null {
  const direct = sanitizeScore(metrics.college_progression_rate)
  if (direct !== null) return direct

  const keySets = [
    ['college_sky', 'college_medical', 'college_seoul', 'college_national'],
    [
      'college_sky_rate',
      'college_medical_rate',
      'college_seoul_rate',
      'college_national_rate',
    ],
  ] as const

  for (const keys of keySets) {
    const values = keys
      .map((key) => sanitizeScore(metrics[key]))
      .filter((v): v is number => v !== null)
    if (values.length === 0) continue
    const sum = values.reduce((acc, v) => acc + v, 0)
    if (sum > 0) return round(Math.min(sum, 100), 1)
  }

  return null
}

function weightedAverage(
  values: Array<{ value: number | null; weight: number }>
): number | null {
  const valid = values.filter((item) => item.value !== null)
  if (valid.length === 0) return null
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0)
  if (weightSum <= 0) return null
  const weighted = valid.reduce(
    (sum, item) => sum + (item.value as number) * item.weight,
    0
  )
  return round(weighted / weightSum, 1)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser()
  if ('response' in auth) return auth.response

  if (getSchoolAnalysisMode() !== 'open') {
    const payload = schoolApiError(
      'preview_only_mode',
      'School analysis detail is temporarily limited to preview mode.',
      409
    )
    return NextResponse.json(payload, { status: payload.status })
  }

  const { id } = await params

  try {
    const supabase = createAdminClient()

    const { data: rows, error: qualityError } = await supabase
      .from('vw_school_quality_latest')
      .select('*')
      .eq('school_id', id)
      .limit(1)

    if (qualityError) {
      const payload = schoolApiError(
        'pipeline_unavailable',
        `School quality query failed: ${qualityError.message}`,
        503
      )
      return NextResponse.json(payload, { status: payload.status })
    }

    const row = rows?.[0]
    if (!row) {
      const payload = schoolApiError(
        'school_not_found',
        'School not found.',
        404
      )
      return NextResponse.json(payload, { status: payload.status })
    }

    const { data: schoolInfo, error: infoError } = await supabase
      .from('schools')
      .select(
        'school_name,school_level,district_code,sigungu_code,address,location,is_active'
      )
      .eq('school_id', id)
      .limit(1)

    if (infoError) {
      const payload = schoolApiError(
        'pipeline_unavailable',
        `School info query failed: ${infoError.message}`,
        503
      )
      return NextResponse.json(payload, { status: payload.status })
    }

    const info = schoolInfo?.[0]

    let districtName = `District ${info?.district_code || row.district_code || ''}`
    const districtCode = info?.district_code || row.district_code || ''

    if (districtCode) {
      const { data: districtRows } = await supabase
        .from('school_districts')
        .select('district_name')
        .eq('district_code', districtCode)
        .limit(1)
      if (districtRows?.[0]?.district_name) {
        districtName = districtRows[0].district_name
      }
    }

    const { data: metricsRows } = await supabase
      .from('school_metrics_official')
      .select('metrics,metric_year,metric_term,source_updated_at,updated_at')
      .eq('school_id', id)
      .order('metric_year', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(12)

    const pickBestMetricRow = (
      rows: Array<{
        metrics?: Record<string, unknown> | null
        metric_year?: number | null
        source_updated_at?: string | null
        updated_at?: string | null
      }>
    ) => {
      if (!rows?.length) return null
      const completeness = (
        metrics: Record<string, unknown> | null | undefined
      ) => {
        if (!metrics) return 0
        const scores = [
          sanitizeScore(metrics.achievement_score),
          sanitizeScore(metrics.progression_outcome_score),
          sanitizeScore(metrics.education_environment_score),
          sanitizeScore(metrics.safety_life_score),
          sanitizeScore(metrics.program_score),
        ]
        return scores.filter((v) => v !== null).length
      }

      const sorted = [...rows].sort((a, b) => {
        const aComp = completeness(a.metrics)
        const bComp = completeness(b.metrics)
        if (aComp !== bComp) return bComp - aComp

        const aYear = Number(a.metric_year || 0)
        const bYear = Number(b.metric_year || 0)
        if (aYear !== bYear) return bYear - aYear

        const aTs = Date.parse(a.updated_at || '') || 0
        const bTs = Date.parse(b.updated_at || '') || 0
        return bTs - aTs
      })

      return sorted[0] || null
    }

    const metricRow = pickBestMetricRow(
      (metricsRows ?? []) as Array<{
        metrics?: Record<string, unknown> | null
        metric_year?: number | null
        source_updated_at?: string | null
        updated_at?: string | null
      }>
    )
    const rawMetrics = (metricRow?.metrics ?? {}) as Record<
      string,
      number | string | null
    >

    const ach =
      sanitizeScore(row.achievement_score) ??
      sanitizeScore(rawMetrics.achievement_score)
    const prog =
      sanitizeScore(row.progression_outcome_score) ??
      sanitizeScore(rawMetrics.progression_outcome_score)
    const env =
      sanitizeScore(row.education_environment_score) ??
      sanitizeScore(rawMetrics.education_environment_score)
    const saf =
      sanitizeScore(row.safety_life_score) ??
      sanitizeScore(rawMetrics.safety_life_score)
    const prg =
      sanitizeScore(row.program_score) ??
      sanitizeScore(rawMetrics.program_score)

    const hasOfficialSchoolinfo =
      typeof rawMetrics.schoolinfo_schul_code === 'string' &&
      [ach, prog, env, saf, prg].some((v) => v !== null)

    const officialProv: MetricProvenance = hasOfficialSchoolinfo
      ? 'official'
      : 'inferred'

    const overall = weightedAverage([
      { value: ach, weight: 0.3 },
      { value: prog, weight: 0.25 },
      { value: env, weight: 0.15 },
      { value: saf, weight: 0.15 },
      { value: prg, weight: 0.15 },
    ])

    const quality: SchoolQualityScore = {
      overall: mv(overall, officialProv),
      achievement: mv(ach, officialProv),
      progression_outcome: mv(prog, officialProv),
      education_environment: mv(env, officialProv),
      safety_life: mv(saf, officialProv),
      programs: mv(prg, officialProv),
    }

    const sigunguCode = String(info?.sigungu_code || row.sigungu_code || '')
    let officialCollegeRate: number | null =
      resolveOfficialCollegeRateFromMetrics(rawMetrics)
    if (officialCollegeRate === null && sigunguCode) {
      try {
        const { data: advancementRows } = await supabase
          .from('sigungu_advancement_stats')
          .select('year,advancement_rate')
          .eq('sigungu_code', sigunguCode)
          .not('advancement_rate', 'is', null)
          .order('year', { ascending: false })
          .limit(1)

        const latest = Array.isArray(advancementRows)
          ? advancementRows[0]
          : null
        officialCollegeRate = sanitizeScore(latest?.advancement_rate)
      } catch {
        officialCollegeRate = null
      }
    }

    const progression: ProgressionStats = {
      general_highschool_rate: mv(
        sanitizeScore(row.general_highschool_rate),
        'inferred',
        '%'
      ),
      special_purpose_highschool_rate: mv(
        sanitizeScore(row.special_purpose_highschool_rate),
        'inferred',
        '%'
      ),
      autonomy_highschool_rate: mv(
        sanitizeScore(row.autonomy_highschool_rate),
        'inferred',
        '%'
      ),
      college_progression_rate: mv(
        officialCollegeRate ?? sanitizeScore(row.college_progression_rate),
        officialCollegeRate !== null ? 'official' : 'inferred',
        '%'
      ),
    }

    let location: { lat: number; lng: number } | null = null
    if (info?.location) {
      const locStr = String(info.location)
      const match = locStr.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/)
      if (match) {
        location = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) }
      }
    }

    const isActive = info?.is_active ?? true
    const dataStatus: SchoolDataStatus = !isActive
      ? 'inactive'
      : hasOfficialSchoolinfo
        ? 'official'
        : 'name_mismatch'

    const officialConf = hasOfficialSchoolinfo ? 90 : 60
    const inferredConf = 60
    const totalConf = round(officialConf * 0.7 + inferredConf * 0.3, 1)

    const school: SchoolDetail = {
      school_id: id,
      school_name: info?.school_name || row.school_name || `School ${id}`,
      school_level: (info?.school_level ||
        row.school_level ||
        'other') as SchoolLevel,
      district_code: districtCode,
      district_name: districtName,
      address: info?.address || '',
      location,
      data_freshness:
        metricRow?.source_updated_at ||
        metricRow?.updated_at ||
        row.source_updated_at ||
        new Date().toISOString(),
      official_reference_year: hasOfficialSchoolinfo
        ? (metricRow?.metric_year ?? null)
        : null,
      confidence_breakdown: {
        official_confidence: officialConf,
        inferred_confidence: inferredConf,
        total_confidence: totalConf,
        formula_version: 'v2.0.0',
      },
      quality,
      progression,
      data_status: dataStatus,
      is_active: isActive,
    }

    return NextResponse.json({ school })
  } catch {
    const payload = schoolApiError(
      'pipeline_unavailable',
      'School detail pipeline unavailable.',
      503
    )
    return NextResponse.json(payload, { status: payload.status })
  }
}
