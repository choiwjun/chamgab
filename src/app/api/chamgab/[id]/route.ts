// @TASK P3-R1-T2 - Chamgab API - 분석 결과 조회
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/chamgab/:id
 * 특정 매물의 참값 분석 결과 조회 (id = propertyId)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      // 분석 결과 없음 - Mock 데이터 반환 (개발용)
      const mockAnalysis = {
        id: 'mock-' + propertyId,
        property_id: propertyId,
        chamgab_price: 850000000,
        min_price: 800000000,
        max_price: 900000000,
        confidence: 0.92,
        analyzed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      }

      return NextResponse.json({ analysis: mockAnalysis, is_mock: true })
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
