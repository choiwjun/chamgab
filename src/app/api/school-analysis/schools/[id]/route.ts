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
  const n = Number(value)
  return Number.isFinite(n) ? n : null
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
      .select('metrics')
      .eq('school_id', id)
      .order('metric_year', { ascending: false })
      .limit(1)

    const rawMetrics = (metricsRows?.[0]?.metrics ?? {}) as Record<
      string,
      number | string | null
    >

    const hasOfficialSchoolinfo =
      typeof rawMetrics.schoolinfo_schul_code === 'string' ||
      typeof rawMetrics.achievement_score === 'number' ||
      typeof rawMetrics.progression_outcome_score === 'number'

    const officialProv: MetricProvenance = hasOfficialSchoolinfo
      ? 'official'
      : 'inferred'

    const ach = asNumber(row.achievement_score) ?? 0
    const prog = asNumber(row.progression_outcome_score) ?? 0
    const env = asNumber(row.education_environment_score) ?? 0
    const saf = asNumber(row.safety_life_score) ?? 0
    const prg = asNumber(row.program_score) ?? 0

    const overall = round(
      ach * 0.3 + prog * 0.25 + env * 0.15 + saf * 0.15 + prg * 0.15,
      1
    )

    const quality: SchoolQualityScore = {
      overall: mv(overall, officialProv),
      achievement: mv(round(ach, 1), officialProv),
      progression_outcome: mv(round(prog, 1), officialProv),
      education_environment: mv(round(env, 1), officialProv),
      safety_life: mv(round(saf, 1), officialProv),
      programs: mv(round(prg, 1), 'inferred'),
    }

    const progression: ProgressionStats = {
      general_highschool_rate: mv(
        row.general_highschool_rate != null
          ? round(Number(row.general_highschool_rate), 1)
          : null,
        'inferred',
        '%'
      ),
      special_purpose_highschool_rate: mv(
        row.special_purpose_highschool_rate != null
          ? round(Number(row.special_purpose_highschool_rate), 1)
          : null,
        'inferred',
        '%'
      ),
      autonomy_highschool_rate: mv(
        row.autonomy_highschool_rate != null
          ? round(Number(row.autonomy_highschool_rate), 1)
          : null,
        'inferred',
        '%'
      ),
      college_progression_rate: mv(
        row.college_progression_rate != null
          ? round(Number(row.college_progression_rate), 1)
          : null,
        'inferred',
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
      school_level: (info?.school_level || row.school_level || 'other') as SchoolLevel,
      district_code: districtCode,
      district_name: districtName,
      address: info?.address || '',
      location,
      data_freshness: row.source_updated_at || new Date().toISOString(),
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
