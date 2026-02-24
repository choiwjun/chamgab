// @TASK P3-R1-T2 - Chamgab API - analysis lookup

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildChamgabQuality } from '../_quality'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * GET /api/chamgab/:id
 * Returns latest non-expired analysis by property_id.
 * Sensitive fields (e.g. user_id) are intentionally excluded.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params
    if (!UUID_REGEX.test(propertyId)) {
      return NextResponse.json(
        { error: 'invalid_property_id' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data: analysis, error } = await admin
      .from('chamgab_analyses')
      .select(
        'id,property_id,chamgab_price,min_price,max_price,confidence,analyzed_at,expires_at,created_at'
      )
      .eq('property_id', propertyId)
      .gt('expires_at', new Date().toISOString())
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !analysis) {
      return NextResponse.json({ analysis: null })
    }

    const quality = await buildChamgabQuality(admin, {
      analysisId: analysis.id,
      propertyId: analysis.property_id,
      chamgabPrice: analysis.chamgab_price,
      confidence: analysis.confidence,
    })

    return NextResponse.json({
      analysis,
      quality,
      quality_flags: quality.quality_flags,
    })
  } catch (error) {
    console.error('[Chamgab API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
