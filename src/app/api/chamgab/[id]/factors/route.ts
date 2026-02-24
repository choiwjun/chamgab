// @TASK P3-R2-T2 - Price Factors API

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * GET /api/chamgab/:id/factors
 * Returns ranked factors for an analysis id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: analysisId } = await params
    if (!UUID_REGEX.test(analysisId)) {
      return NextResponse.json(
        { error: 'invalid_analysis_id' },
        { status: 400 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const parsedLimit = Number(searchParams.get('limit') || 5)
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 10)
      : 5

    const admin = createAdminClient()
    const { data: factors, error } = await admin
      .from('price_factors')
      .select('id,analysis_id,rank,factor_name,factor_name_ko,contribution,direction')
      .eq('analysis_id', analysisId)
      .order('rank', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('[Factors API] Supabase error:', error.message)
      return NextResponse.json(
        { factors: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    return NextResponse.json({
      factors: factors || [],
      total: factors?.length || 0,
      limit,
    })
  } catch (error) {
    console.error('[Factors API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

