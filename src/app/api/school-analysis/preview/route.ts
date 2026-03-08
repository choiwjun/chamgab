export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type {
  QualityFlag,
  SchoolDistrictGrade,
  SchoolDistrictSummary,
  SchoolPreviewResponse,
} from '@/types/school-analysis'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSchoolAnalysisMode, schoolApiError } from '../_helpers'

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function toIsoString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString()
  }
  if (value !== null && value !== undefined) {
    const parsed = new Date(String(value))
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString()
  }
  return fallback
}

function toFlags(raw: unknown): QualityFlag[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is QualityFlag => typeof v === 'string')
}

function gradeFromScore(score: number | null): SchoolDistrictGrade {
  if (score === null) return 'D'
  if (score >= 85) return 'S'
  if (score >= 75) return 'A'
  if (score >= 65) return 'B'
  if (score >= 55) return 'C'
  return 'D'
}

function emptyLevelBreakdown() {
  return {
    elementary: 0,
    middle: 0,
    high: 0,
    other: 0,
  }
}

function chunkArray<T>(input: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [input]
  const chunks: T[][] = []
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize))
  }
  return chunks
}

export async function GET(request: NextRequest) {
  const districtCode =
    request.nextUrl.searchParams.get('district_code') || undefined
  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 20)
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 300)
    : 20

  const mode = getSchoolAnalysisMode()

  try {
    const supabase = createAdminClient()
    let gatePass = false

    try {
      const { data: gateData } = await supabase.rpc(
        'get_school_analysis_launch_gate'
      )
      const gateRow = Array.isArray(gateData) ? gateData[0] : null
      gatePass = Boolean(gateRow?.gate_pass)
    } catch {
      gatePass = false
    }

    let query = supabase.from('vw_school_analysis_preview').select('*')

    if (districtCode) {
      query = query.eq('district_code', districtCode)
    }

    const { data, error } = await query
    if (error) {
      const payload = schoolApiError(
        'pipeline_unavailable',
        'Failed to load school preview.',
        503
      )
      return NextResponse.json(payload, { status: payload.status })
    }

    const rawRows = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : []
    const rows = districtCode
      ? rawRows
      : [...rawRows]
          .sort((a, b) => {
            const aScore = asNullableNumber(a.overall_score)
            const bScore = asNullableNumber(b.overall_score)
            const aRank = aScore ?? Number.NEGATIVE_INFINITY
            const bRank = bScore ?? Number.NEGATIVE_INFINITY
            if (aRank !== bRank) return bRank - aRank
            return String(a.district_code || '').localeCompare(
              String(b.district_code || '')
            )
          })
          .slice(0, limit)
    const districtCodes = rows
      .map((row) => String(row.district_code || ''))
      .filter((code) => code.length > 0)

    const sigunguByDistrict = new Map<string, string>()
    const levelByDistrict = new Map<
      string,
      { elementary: number; middle: number; high: number; other: number }
    >()
    const progressionByDistrict = new Map<
      string,
      {
        collegeSum: number
        collegeCount: number
        specialSum: number
        specialCount: number
        autonomySum: number
        autonomyCount: number
      }
    >()
    const academyBySigungu = new Map<
      string,
      { academy_count: number | null; avg_monthly_fee: number | null }
    >()
    const officialAdvancementBySigungu = new Map<
      string,
      { year: number; advancement_rate: number }
    >()

    if (districtCodes.length > 0) {
      const districtChunks = chunkArray(districtCodes, 40)

      try {
        for (const districtChunk of districtChunks) {
          if (districtChunk.length === 0) continue
          const { data: districtRows, error: districtError } = await supabase
            .from('school_districts')
            .select('district_code,sigungu_code')
            .in('district_code', districtChunk)

          if (districtError) {
            console.warn(
              '[school-preview] failed to load district->sigungu chunk',
              districtError.message
            )
            continue
          }

          if (!Array.isArray(districtRows)) continue
          for (const row of districtRows) {
            const districtCode = String(row.district_code || '')
            const sigunguCode = String(row.sigungu_code || '')
            if (districtCode && sigunguCode) {
              sigunguByDistrict.set(districtCode, sigunguCode)
            }
          }
        }
      } catch {
        // Keep preview response available even if enrichment fails.
      }

      const activeSchoolIds = new Set<string>()
      try {
        for (const districtChunk of districtChunks) {
          let from = 0
          const pageSize = 1000

          while (true) {
            const to = from + pageSize - 1
            const { data: schoolRows, error: schoolError } = await supabase
              .from('schools')
              .select('school_id,district_code,school_level')
              .eq('is_active', true)
              .in('district_code', districtChunk)
              .range(from, to)

            if (schoolError) {
              console.warn(
                '[school-preview] failed to load school level breakdown chunk',
                schoolError.message
              )
              break
            }

            const rows = Array.isArray(schoolRows) ? schoolRows : []
            for (const row of rows) {
              const districtCode = String(row.district_code || '')
              const schoolId = String(row.school_id || '')
              if (!districtCode) continue
              if (schoolId) activeSchoolIds.add(schoolId)

              const current =
                levelByDistrict.get(districtCode) || emptyLevelBreakdown()
              const level = String(row.school_level || 'other')
              if (level === 'elementary') current.elementary += 1
              else if (level === 'middle') current.middle += 1
              else if (level === 'high') current.high += 1
              else current.other += 1
              levelByDistrict.set(districtCode, current)
            }

            if (rows.length < pageSize) break
            from += pageSize
          }
        }
      } catch {
        // Keep preview response available even if enrichment fails.
      }

      try {
        for (const districtChunk of districtChunks) {
          let from = 0
          const pageSize = 1000

          while (true) {
            const to = from + pageSize - 1
            const { data: progressionRows, error: progressionError } =
              await supabase
                .from('vw_school_quality_latest')
                .select(
                  'school_id,district_code,college_progression_rate,special_purpose_highschool_rate,autonomy_highschool_rate'
                )
                .in('district_code', districtChunk)
                .range(from, to)

            if (progressionError) {
              console.warn(
                '[school-preview] failed to load progression chunk',
                progressionError.message
              )
              break
            }

            const rows = Array.isArray(progressionRows) ? progressionRows : []
            for (const row of rows) {
              const districtCode = String(row.district_code || '')
              if (!districtCode) continue

              const schoolId = String(row.school_id || '')
              if (
                activeSchoolIds.size > 0 &&
                schoolId &&
                !activeSchoolIds.has(schoolId)
              ) {
                continue
              }

              const acc = progressionByDistrict.get(districtCode) || {
                collegeSum: 0,
                collegeCount: 0,
                specialSum: 0,
                specialCount: 0,
                autonomySum: 0,
                autonomyCount: 0,
              }

              const college = asNullableNumber(row.college_progression_rate)
              if (college !== null) {
                acc.collegeSum += college
                acc.collegeCount += 1
              }

              const special = asNullableNumber(
                row.special_purpose_highschool_rate
              )
              if (special !== null) {
                acc.specialSum += special
                acc.specialCount += 1
              }

              const autonomy = asNullableNumber(row.autonomy_highschool_rate)
              if (autonomy !== null) {
                acc.autonomySum += autonomy
                acc.autonomyCount += 1
              }

              progressionByDistrict.set(districtCode, acc)
            }

            if (rows.length < pageSize) break
            from += pageSize
          }
        }
      } catch {
        // Keep preview response available even if enrichment fails.
      }

      try {
        const sigunguCodes = Array.from(new Set(sigunguByDistrict.values()))
        const sigunguChunks = chunkArray(sigunguCodes, 120)
        for (const sigunguChunk of sigunguChunks) {
          if (sigunguChunk.length === 0) continue
          const { data: academyRows, error: academyError } = await supabase
            .from('vw_academy_ecosystem_by_sigungu')
            .select('sigungu_code,academy_count,avg_monthly_fee')
            .in('sigungu_code', sigunguChunk)

          if (academyError) {
            console.warn(
              '[school-preview] failed to load academy ecosystem chunk',
              academyError.message
            )
            continue
          }

          if (!Array.isArray(academyRows)) continue
          for (const row of academyRows) {
            const sigunguCode = String(row.sigungu_code || '')
            if (!sigunguCode) continue
            academyBySigungu.set(sigunguCode, {
              academy_count: asNullableNumber(row.academy_count),
              avg_monthly_fee: asNullableNumber(row.avg_monthly_fee),
            })
          }
        }
      } catch {
        // Keep preview response available even if enrichment fails.
      }

      try {
        const sigunguCodes = Array.from(new Set(sigunguByDistrict.values()))
        const sigunguChunks = chunkArray(sigunguCodes, 120)
        for (const sigunguChunk of sigunguChunks) {
          if (sigunguChunk.length === 0) continue
          const { data: advancementRows, error: advancementError } =
            await supabase
              .from('sigungu_advancement_stats')
              .select('sigungu_code,year,advancement_rate')
              .in('sigungu_code', sigunguChunk)
              .not('advancement_rate', 'is', null)
              .order('year', { ascending: false })

          if (advancementError) {
            console.warn(
              '[school-preview] failed to load official advancement rows',
              advancementError.message
            )
            continue
          }

          if (!Array.isArray(advancementRows)) continue
          for (const row of advancementRows) {
            const sigunguCode = String(row.sigungu_code || '')
            const advancementRate = asNullableNumber(row.advancement_rate)
            const year = Number(row.year || 0)
            if (
              !sigunguCode ||
              advancementRate === null ||
              !Number.isFinite(year)
            ) {
              continue
            }
            const current = officialAdvancementBySigungu.get(sigunguCode)
            if (!current || year > current.year) {
              officialAdvancementBySigungu.set(sigunguCode, {
                year,
                advancement_rate: advancementRate,
              })
            }
          }
        }
      } catch {
        // Keep preview response available even if enrichment fails.
      }
    }

    const rankedRows = [...rows]
      .map((row) => ({
        district_code: String(row.district_code || ''),
        overall_score: asNullableNumber(row.overall_score),
      }))
      .filter((row) => row.district_code.length > 0)
      .sort((a, b) => {
        const aScore = a.overall_score ?? Number.NEGATIVE_INFINITY
        const bScore = b.overall_score ?? Number.NEGATIVE_INFINITY
        if (aScore !== bScore) return bScore - aScore
        return a.district_code.localeCompare(b.district_code)
      })

    const rankByDistrict = new Map<string, number>()
    rankedRows.forEach((row, index) => {
      rankByDistrict.set(row.district_code, index + 1)
    })

    // Build sido-level fee fallback for rare sigungu with missing monthly fee.
    const academyFeeSeenSigunguBySido = new Map<string, Set<string>>()
    const academyFeeAccumulatorBySido = new Map<
      string,
      { sum: number; count: number }
    >()
    const accumulateSidoFee = (
      sidoCode: string,
      sigunguCode: string,
      fee: number | null
    ) => {
      if (!sidoCode || fee === null || fee === undefined) return
      const seen =
        academyFeeSeenSigunguBySido.get(sidoCode) || new Set<string>()
      if (seen.has(sigunguCode)) return
      seen.add(sigunguCode)
      academyFeeSeenSigunguBySido.set(sidoCode, seen)
      const current = academyFeeAccumulatorBySido.get(sidoCode) || {
        sum: 0,
        count: 0,
      }
      current.sum += fee
      current.count += 1
      academyFeeAccumulatorBySido.set(sidoCode, current)
    }

    // Seed from already loaded target sigungu.
    academyBySigungu.forEach((snapshot, sigunguCode) => {
      const sidoCode = sigunguCode.slice(0, 2)
      accumulateSidoFee(sidoCode, sigunguCode, snapshot.avg_monthly_fee)
    })

    // Enrich with all sigungu rows in the same sido so single-district requests
    // share the same fallback behavior as full list requests.
    const fallbackSidoCodes = Array.from(
      new Set(
        Array.from(sigunguByDistrict.values())
          .map((code) => String(code || '').slice(0, 2))
          .filter((code) => code.length === 2)
      )
    )
    for (const sidoCode of fallbackSidoCodes) {
      let from = 0
      const pageSize = 200
      while (true) {
        const to = from + pageSize - 1
        const { data: sidoRows, error: sidoError } = await supabase
          .from('vw_academy_ecosystem_by_sigungu')
          .select('sigungu_code,avg_monthly_fee')
          .like('sigungu_code', `${sidoCode}%`)
          .range(from, to)

        if (sidoError) {
          console.warn(
            '[school-preview] failed to load sido-level academy fee fallback',
            sidoCode,
            sidoError.message
          )
          break
        }

        const rows = Array.isArray(sidoRows) ? sidoRows : []
        for (const row of rows) {
          const sigunguCode = String(row.sigungu_code || '')
          if (!sigunguCode) continue
          accumulateSidoFee(
            sigunguCode.slice(0, 2),
            sigunguCode,
            asNullableNumber(row.avg_monthly_fee)
          )
        }

        if (rows.length < pageSize) break
        from += pageSize
      }
    }

    const academyFeeFallbackBySido = new Map<string, number>()
    academyFeeAccumulatorBySido.forEach((acc, sidoCode) => {
      if (acc.count <= 0) return
      academyFeeFallbackBySido.set(sidoCode, round(acc.sum / acc.count, 2))
    })

    const items: SchoolDistrictSummary[] = rows.map((row) => {
      const officialCoverage = asNumber(
        row.official_coverage_pct,
        asNumber(row.official_confidence, 0)
      )
      const inferredRatio = asNumber(
        row.inferred_ratio_pct,
        Math.max(0, 100 - officialCoverage)
      )
      const flags = toFlags(row.quality_flags)
      const districtCode = String(row.district_code || '')
      const progression = progressionByDistrict.get(districtCode)
      const levelBreakdown =
        levelByDistrict.get(districtCode) || emptyLevelBreakdown()
      const sigunguCode = sigunguByDistrict.get(districtCode) || ''
      const academy = academyBySigungu.get(sigunguCode)
      const officialAdvancement = officialAdvancementBySigungu.get(sigunguCode)
      const overallScore = asNullableNumber(row.overall_score)
      const directAcademyAvgMonthlyFee = academy?.avg_monthly_fee ?? null
      const fallbackSidoCode = (sigunguCode || districtCode).slice(0, 2)
      const fallbackAcademyAvgMonthlyFee =
        directAcademyAvgMonthlyFee === null
          ? (academyFeeFallbackBySido.get(fallbackSidoCode) ?? null)
          : null
      const academyAvgMonthlyFee =
        directAcademyAvgMonthlyFee ?? fallbackAcademyAvgMonthlyFee
      const academyFeeEstimated =
        directAcademyAvgMonthlyFee === null && academyAvgMonthlyFee !== null
      const academyFeeReliability = academyAvgMonthlyFee === null ? 'low' : 'ok'
      const dataFreshness = toIsoString(
        row.data_freshness,
        new Date().toISOString()
      ) as string

      return {
        district_code: districtCode,
        district_name: String(
          row.district_name || `District ${row.district_code}`
        ),
        school_count: asNumber(row.school_count, 0),
        overall_score: {
          value: overallScore,
          unit: 'score',
          provenance: officialCoverage >= 80 ? 'official' : 'inferred',
          availability: {
            available: row.overall_score != null,
            reason: row.overall_score != null ? 'available' : 'missing_source',
          },
          updated_at: toIsoString(row.data_freshness),
        },
        data_freshness: dataFreshness,
        confidence_score: asNumber(row.confidence_score, 0),
        confidence_breakdown: {
          official_confidence: asNumber(row.official_confidence, 0),
          inferred_confidence: asNumber(row.inferred_confidence, 0),
          total_confidence: asNumber(row.confidence_score, 0),
          formula_version: String(row.formula_version || 'v2.0.0'),
        },
        quality: {
          official_coverage_pct: officialCoverage,
          inferred_ratio_pct: inferredRatio,
          flags,
        },
        insights: {
          rank: rankByDistrict.get(districtCode) || null,
          grade: gradeFromScore(overallScore),
          college_progression_rate:
            officialAdvancement?.advancement_rate ??
            (progression && progression.collegeCount > 0
              ? round(progression.collegeSum / progression.collegeCount, 1)
              : null),
          special_purpose_highschool_rate:
            progression && progression.specialCount > 0
              ? round(progression.specialSum / progression.specialCount, 1)
              : null,
          autonomy_highschool_rate:
            progression && progression.autonomyCount > 0
              ? round(progression.autonomySum / progression.autonomyCount, 1)
              : null,
          school_level_breakdown: {
            elementary: levelBreakdown.elementary,
            middle: levelBreakdown.middle,
            high: levelBreakdown.high,
            other: levelBreakdown.other,
          },
          academy_count: academy?.academy_count ?? null,
          academy_avg_monthly_fee: academyAvgMonthlyFee,
          college_progression_estimated: officialAdvancement == null,
          academy_fee_estimated: academyFeeEstimated,
          academy_fee_reliability: academyFeeReliability,
        },
      }
    })

    const response: SchoolPreviewResponse = {
      items,
      generated_at: new Date().toISOString(),
      meta: {
        mode,
        quality_version: 'v2.0.0',
        readiness: mode === 'open' && gatePass ? 'go' : 'hold',
      },
    }

    return NextResponse.json(response)
  } catch {
    const payload = schoolApiError(
      'pipeline_unavailable',
      'School preview pipeline is unavailable.',
      503
    )
    return NextResponse.json(payload, { status: payload.status })
  }
}
