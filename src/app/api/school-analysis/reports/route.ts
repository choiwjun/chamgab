export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
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
import { buildMockReport, normalizeDistrictCode } from '../_helpers'

type CreateReportBody = {
  district_code?: string
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

function round(v: number, p = 1) {
  const f = 10 ** p
  return Math.round(v * f) / f
}

export async function POST(request: NextRequest) {
  let body: CreateReportBody
  try {
    body = (await request.json()) as CreateReportBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const districtCode = normalizeDistrictCode(body.district_code)

  try {
    const supabase = createAdminClient()

    // 1. District info from preview view
    const { data: previewRows } = await supabase
      .from('vw_school_analysis_preview')
      .select('*')
      .eq('district_code', districtCode)
      .limit(1)

    const preview = previewRows?.[0]
    if (!preview) {
      // Fallback to mock if district not found in DB
      const report = buildMockReport({ userId: null, districtCode })
      return NextResponse.json(
        { report: report as SchoolAnalysisReport, cached: false },
        { status: 201 }
      )
    }

    // 2. School quality per school in this district
    const { data: schoolRows } = await supabase
      .from('vw_school_quality_latest')
      .select('*')
      .eq('district_code', districtCode)

    // 3. Academy ecosystem for this sigungu
    const sigunguCode = districtCode // district_code == sigungu_code in our schema
    const { data: academyRows } = await supabase
      .from('vw_academy_ecosystem_by_sigungu')
      .select('*')
      .eq('sigungu_code', sigunguCode)
      .limit(1)

    const academy = academyRows?.[0]
    const schools = schoolRows || []

    // 4. Fetch is_active + official matching status for data quality
    const schoolIds = schools.map((s) => s.school_id as string)

    const { data: activeRows } =
      schoolIds.length > 0
        ? await supabase
            .from('schools')
            .select('school_id,is_active')
            .in('school_id', schoolIds.slice(0, 500))
        : { data: [] }

    const activeMap = new Map<string, boolean>()
    for (const r of activeRows || []) {
      activeMap.set(r.school_id, r.is_active ?? true)
    }

    const { data: metricsRows } =
      schoolIds.length > 0
        ? await supabase
            .from('school_metrics_official')
            .select('school_id,metrics')
            .in('school_id', schoolIds.slice(0, 500))
            .order('metric_year', { ascending: false })
        : { data: [] }

    // Deduplicate: keep only latest per school_id
    const officialSet = new Set<string>()
    for (const r of metricsRows || []) {
      const metrics = (r.metrics ?? {}) as Record<string, unknown>
      if (typeof metrics.schoolinfo_schul_code === 'string') {
        officialSet.add(r.school_id)
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

    // Build school quality averages
    const schoolCount = schools.length
    const avgAchievement =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.achievement_score) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgProgression =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.progression_outcome_score) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgEnvironment =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.education_environment_score) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgSafety =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.safety_life_score) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgPrograms =
      schoolCount > 0
        ? round(
            schools.reduce((s, r) => s + (Number(r.program_score) || 0), 0) /
              schoolCount,
            1
          )
        : null

    const qualityOverall =
      avgAchievement !== null
        ? round(
            (avgAchievement ?? 0) * 0.3 +
              (avgProgression ?? 0) * 0.25 +
              (avgEnvironment ?? 0) * 0.15 +
              (avgSafety ?? 0) * 0.15 +
              (avgPrograms ?? 0) * 0.15,
            1
          )
        : null

    const schoolQuality: SchoolQualityScore = {
      overall: mv(qualityOverall, 'official'),
      achievement: mv(avgAchievement, 'official'),
      progression_outcome: mv(avgProgression, 'official'),
      education_environment: mv(avgEnvironment, 'official'),
      safety_life: mv(avgSafety, 'official'),
      programs: mv(avgPrograms, 'inferred'),
    }

    // Build progression averages
    const avgGeneral =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.general_highschool_rate) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgSpecial =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.special_purpose_highschool_rate) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgAutonomy =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.autonomy_highschool_rate) || 0),
              0
            ) / schoolCount,
            1
          )
        : null
    const avgCollege =
      schoolCount > 0
        ? round(
            schools.reduce(
              (s, r) => s + (Number(r.college_progression_rate) || 0),
              0
            ) / schoolCount,
            1
          )
        : null

    const progression: ProgressionStats = {
      general_highschool_rate: mv(avgGeneral, 'inferred', '%'),
      special_purpose_highschool_rate: mv(avgSpecial, 'inferred', '%'),
      autonomy_highschool_rate: mv(avgAutonomy, 'inferred', '%'),
      college_progression_rate: mv(avgCollege, 'inferred', '%'),
    }

    // Build academy ecosystem
    const density = academy ? Number(academy.density_score) || 0 : null
    const diversity = academy
      ? Number(academy.subject_diversity_score) || 0
      : null
    const feeAfford = academy ? Number(academy.fee_affordability_score) : null
    const accessibilityScore = 70 // placeholder
    const academyOverall =
      density !== null
        ? round(
            (density ?? 0) * 0.35 +
              (diversity ?? 0) * 0.25 +
              accessibilityScore * 0.2 +
              (feeAfford ?? 55) * 0.2,
            1
          )
        : null

    const academyEcosystem: AcademyEcosystem = {
      overall: mv(academyOverall, 'inferred'),
      density: mv(density, 'official'),
      subject_diversity: mv(diversity, 'inferred'),
      accessibility: mv(accessibilityScore, 'inferred'),
      fee_affordability: mv(feeAfford, 'official'),
    }

    const commuteSafetyScore = Number(preview.commute_safety_score) || 70
    const commuteSafety = mv(commuteSafetyScore, 'inferred')

    const overallScore = round(
      (qualityOverall ?? 0) * 0.45 +
        (academyOverall ?? 0) * 0.35 +
        commuteSafetyScore * 0.2,
      1
    )

    const officialConf = Number(preview.official_confidence) || 0
    const inferredConf = Number(preview.inferred_confidence) || 0

    // Build school list
    const schoolList: SchoolOverview[] = schools.slice(0, 50).map((s) => {
      const ach = Number(s.achievement_score) || 0
      const prog = Number(s.progression_outcome_score) || 0
      const env = Number(s.education_environment_score) || 0
      const saf = Number(s.safety_life_score) || 0
      const prg = Number(s.program_score) || 0
      const score = round(
        ach * 0.3 + prog * 0.25 + env * 0.15 + saf * 0.15 + prg * 0.15,
        1
      )
      return {
        school_id: s.school_id,
        school_name: s.school_name,
        school_level: s.school_level || 'other',
        overall_score: mv(score, 'official'),
        data_status: getDataStatus(s.school_id),
      }
    })

    const report: SchoolAnalysisReport = {
      id: crypto.randomUUID(),
      user_id: null,
      district_code: districtCode,
      district_name: preview.district_name || `District ${districtCode}`,
      generated_at: new Date().toISOString(),
      data_freshness: preview.data_freshness || new Date().toISOString(),
      confidence_score: Number(preview.confidence_score) || 0,
      confidence_breakdown: {
        official_confidence: officialConf,
        inferred_confidence: inferredConf,
        total_confidence: Number(preview.confidence_score) || 0,
        formula_version: preview.formula_version || 'v1.0.0',
      },
      overall_score: mv(overallScore, 'inferred'),
      school_quality: schoolQuality,
      progression,
      academy_ecosystem: academyEcosystem,
      commute_safety: commuteSafety,
      schools: schoolList,
      data_quality: dataQuality,
    }

    return NextResponse.json({ report, cached: false }, { status: 201 })
  } catch (err) {
    console.error(
      '[school-analysis/reports] DB query failed, falling back to mock:',
      err
    )
    const report = buildMockReport({ userId: null, districtCode })
    return NextResponse.json(
      { report: report as SchoolAnalysisReport, cached: false },
      { status: 201 }
    )
  }
}
