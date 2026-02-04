// @TASK P3-R2-T2 - Price Factors API
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// Mock 가격 요인 데이터
const MOCK_FACTORS = [
  { rank: 1, factor_name: 'subway_distance', factor_name_ko: '지하철역 거리', contribution: 210000000, direction: 'positive' },
  { rank: 2, factor_name: 'school_quality', factor_name_ko: '학군 수준', contribution: 150000000, direction: 'positive' },
  { rank: 3, factor_name: 'building_age', factor_name_ko: '건물 연식', contribution: -80000000, direction: 'negative' },
  { rank: 4, factor_name: 'floor_level', factor_name_ko: '층수', contribution: 50000000, direction: 'positive' },
  { rank: 5, factor_name: 'park_distance', factor_name_ko: '공원 접근성', contribution: 45000000, direction: 'positive' },
  { rank: 6, factor_name: 'noise_level', factor_name_ko: '소음 수준', contribution: -35000000, direction: 'negative' },
  { rank: 7, factor_name: 'parking_ratio', factor_name_ko: '주차 대수', contribution: 30000000, direction: 'positive' },
  { rank: 8, factor_name: 'brand_value', factor_name_ko: '브랜드 가치', contribution: 25000000, direction: 'positive' },
  { rank: 9, factor_name: 'view_quality', factor_name_ko: '조망권', contribution: 20000000, direction: 'positive' },
  { rank: 10, factor_name: 'sunlight', factor_name_ko: '일조량', contribution: 15000000, direction: 'positive' },
]

/**
 * GET /api/chamgab/:analysisId/factors
 * 가격 요인 목록 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  try {
    const { analysisId } = await params
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10)

    // DB에서 요인 조회
    const { data: factors, error } = await supabase
      .from('price_factors')
      .select('*')
      .eq('analysis_id', analysisId)
      .order('rank', { ascending: true })
      .limit(limit)

    if (error || !factors || factors.length === 0) {
      // Mock 데이터 반환
      const mockFactors = MOCK_FACTORS.slice(0, limit).map((f, i) => ({
        id: `mock-factor-${i}`,
        analysis_id: analysisId,
        ...f,
        created_at: new Date().toISOString(),
      }))

      return NextResponse.json({
        factors: mockFactors,
        is_mock: true,
        total: MOCK_FACTORS.length,
        limit,
      })
    }

    return NextResponse.json({
      factors,
      total: factors.length,
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
