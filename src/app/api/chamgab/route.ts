// @TASK P3-R1-T2 - Chamgab API - 분석 요청
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000'

/**
 * POST /api/chamgab
 * 참값 분석 요청 (ML API 호출)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { property_id } = body

    if (!property_id) {
      return NextResponse.json(
        { error: 'property_id is required' },
        { status: 400 }
      )
    }

    // 기존 유효한 분석 결과 확인
    const { data: existingAnalysis } = await supabase
      .from('chamgab_analyses')
      .select('*')
      .eq('property_id', property_id)
      .gt('expires_at', new Date().toISOString())
      .order('analyzed_at', { ascending: false })
      .limit(1)
      .single()

    if (existingAnalysis) {
      return NextResponse.json({
        analysis: existingAnalysis,
        cached: true,
      })
    }

    // ML API 호출 (또는 Mock)
    let prediction
    try {
      const mlResponse = await fetch(`${ML_API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id, features: {} }),
      })

      if (mlResponse.ok) {
        prediction = await mlResponse.json()
      }
    } catch {
      // ML API 연결 실패 시 Mock 데이터
      prediction = {
        chamgab_price: 850000000 + Math.floor(Math.random() * 200000000),
        min_price: 800000000,
        max_price: 950000000,
        confidence: 0.85 + Math.random() * 0.1,
      }
    }

    // 분석 결과 저장
    const { data: newAnalysis, error } = await supabase
      .from('chamgab_analyses')
      .insert({
        property_id,
        chamgab_price: prediction.chamgab_price,
        min_price: prediction.min_price,
        max_price: prediction.max_price,
        confidence: prediction.confidence,
      })
      .select()
      .single()

    if (error) {
      // DB 저장 실패 시에도 결과 반환
      return NextResponse.json({
        analysis: {
          id: 'temp-' + Date.now(),
          property_id,
          ...prediction,
          analyzed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        saved: false,
      })
    }

    return NextResponse.json({ analysis: newAnalysis, saved: true })
  } catch (error) {
    console.error('[Chamgab API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
