export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type {
  QualityFlag,
  SchoolDistrictSummary,
  SchoolPreviewResponse,
} from '@/types/school-analysis'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getSchoolAnalysisMode,
  schoolApiError,
} from '../_helpers'

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toFlags(raw: unknown): QualityFlag[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is QualityFlag => typeof v === 'string')
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

    let query = supabase
      .from('vw_school_analysis_preview')
      .select('*')
      .order('overall_score', { ascending: false })
      .order('district_code')
      .limit(limit)

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

    const rows = Array.isArray(data) ? data : []

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

      return {
        district_code: String(row.district_code),
        district_name: String(row.district_name || `District ${row.district_code}`),
        school_count: asNumber(row.school_count, 0),
        overall_score: {
          value: asNumber(row.overall_score, 0),
          unit: 'score',
          provenance: officialCoverage >= 80 ? 'official' : 'inferred',
          availability: {
            available: row.overall_score != null,
            reason: row.overall_score != null ? 'available' : 'missing_source',
          },
          updated_at: row.data_freshness || undefined,
        },
        data_freshness: row.data_freshness || new Date().toISOString(),
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
