// @TASK P3-R2-T2 - Price Factors API

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/**
 * GET /api/chamgab/:id/factors
 * 가격 요인 목록 조회 (id = analysisId)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase()
    const { id: analysisId } = await params
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10)

    // DB에서 요인 조회
    const { data: factors, error } = await supabase
      .from('price_factors')
      .select('*')
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
