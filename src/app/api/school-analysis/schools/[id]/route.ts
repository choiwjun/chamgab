export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
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
import { buildMockSchoolDetail } from '../../_helpers'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = createAdminClient()

    const { data: rows } = await supabase
      .from('vw_school_quality_latest')
      .select('*')
      .eq('school_id', id)
      .limit(1)

    const row = rows?.[0]
    if (!row) {
      const school = buildMockSchoolDetail(id)
      return NextResponse.json({ school })
    }

    const { data: schoolInfo } = await supabase
      .from('schools')
      .select(
        'school_name,school_level,district_code,sigungu_code,address,location,is_active'
      )
      .eq('school_id', id)
      .limit(1)

    const info = schoolInfo?.[0]
    const schoolName = info?.school_name || row.school_name || `School ${id}`
    const schoolLevel = (info?.school_level ||
      row.school_level ||
      'other') as SchoolLevel
    const districtCode = info?.district_code || row.district_code || ''
    const address = info?.address || ''

    let districtName = `District ${districtCode}`
    if (districtCode) {
      const { data: districtRows } = await supabase
        .from('school_districts')
        .select('district_name')
        .eq('district_code', districtCode)
        .limit(1)
      if (districtRows?.[0]) {
        districtName = districtRows[0].district_name
      }
    }

    // Fetch raw metrics JSONB — needed for provenance and university breakdown.
    // collect_school_official_data.py writes grad_rate, avg_class_size, schoolinfo_schul_code, etc.
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
    // Data from schoolinfo.go.kr API is genuinely official
    const hasOfficialSchoolinfo =
      typeof rawMetrics.schoolinfo_schul_code === 'string'
    const officialProv: MetricProvenance = hasOfficialSchoolinfo
      ? 'official'
      : 'inferred'

    const ach = Number(row.achievement_score) || 0
    const prog = Number(row.progression_outcome_score) || 0
    const env = Number(row.education_environment_score) || 0
    const saf = Number(row.safety_life_score) || 0
    const prg = Number(row.program_score) || 0
    const overall = round(
      ach * 0.3 + prog * 0.25 + env * 0.15 + saf * 0.15 + prg * 0.15,
      1
    )

    const quality: SchoolQualityScore = {
      overall: mv(overall, officialProv),
      achievement: mv(round(ach, 1), 'inferred'),
      progression_outcome: mv(round(prog, 1), officialProv),
      education_environment: mv(round(env, 1), officialProv),
      safety_life: mv(round(saf, 1), 'inferred'),
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

    // Data status
    const isActive = info?.is_active ?? true
    const dataStatus: SchoolDataStatus = !isActive
      ? 'inactive'
      : hasOfficialSchoolinfo
        ? 'official'
        : 'name_mismatch'

    // Confidence: higher when we have official data from schoolinfo.go.kr
    const officialConf = hasOfficialSchoolinfo
      ? 90
      : row.achievement_score != null
        ? 70
        : 40
    const inferredConf = 65
    const totalConf = round(officialConf * 0.7 + inferredConf * 0.3, 1)

    const school: SchoolDetail = {
      school_id: id,
      school_name: schoolName,
      school_level: schoolLevel,
      district_code: districtCode,
      district_name: districtName,
      address,
      location,
      data_freshness: row.source_updated_at || new Date().toISOString(),
      confidence_breakdown: {
        official_confidence: officialConf,
        inferred_confidence: inferredConf,
        total_confidence: totalConf,
        formula_version: 'v1.0.0',
      },
      quality,
      progression,
      data_status: dataStatus,
      is_active: isActive,
    }

    return NextResponse.json({ school })
  } catch (err) {
    console.error(
      '[school-analysis/schools] DB query failed, falling back to mock:',
      err
    )
    const school = buildMockSchoolDetail(id)
    return NextResponse.json({ school })
  }
}
