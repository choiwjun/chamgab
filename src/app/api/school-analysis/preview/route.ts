export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { SchoolDistrictSummary } from '@/types/school-analysis'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMockPreview } from '../_helpers'

export async function GET(request: NextRequest) {
  const districtCode =
    request.nextUrl.searchParams.get('district_code') || undefined
  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 20)
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 300)
    : 20

  let items: SchoolDistrictSummary[]

  try {
    const supabase = createAdminClient()

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

    if (error || !Array.isArray(data) || data.length === 0) {
      items = buildMockPreview({ districtCode, limit })
    } else {
      items = data.map((row) => ({
        district_code: row.district_code,
        district_name: row.district_name,
        school_count: Number(row.school_count ?? 0),
        overall_score: {
          value: Number(row.overall_score ?? 0),
          unit: 'score',
          provenance: 'inferred',
          availability: {
            available: row.overall_score != null,
            reason: row.overall_score != null ? 'available' : 'missing_source',
          },
          updated_at: row.data_freshness || undefined,
        },
        data_freshness: row.data_freshness || new Date().toISOString(),
        confidence_score: Number(row.confidence_score ?? 0),
        confidence_breakdown: {
          official_confidence: Number(row.official_confidence ?? 0),
          inferred_confidence: Number(row.inferred_confidence ?? 0),
          total_confidence: Number(row.confidence_score ?? 0),
          formula_version: row.formula_version || 'v1.0.0',
        },
      }))
    }
  } catch {
    items = buildMockPreview({ districtCode, limit })
  }

  return NextResponse.json({
    items,
    generated_at: new Date().toISOString(),
  })
}
