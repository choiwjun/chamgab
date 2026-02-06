// @TASK P3-R1-T2 - Chamgab API - 분석 결과 조회

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
 * GET /api/chamgab/:id
 * 특정 매물의 참값 분석 결과 조회 (id = propertyId)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase()
    const { id: propertyId } = await params

    // 유효한 분석 결과 조회 (만료되지 않은 것)
    const { data: analysis, error } = await supabase
      .from('chamgab_analyses')
      .select('*')
      .eq('property_id', propertyId)
      .gt('expires_at', new Date().toISOString())
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !analysis) {
      // 분석 결과 없음
      return NextResponse.json(
        { analysis: null, message: 'No analysis found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('[Chamgab API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
