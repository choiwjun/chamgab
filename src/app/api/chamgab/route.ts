// @TASK P3-R1-T2 - Chamgab API - 분석 요청

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

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000'

/**
 * POST /api/chamgab
 * 참값 분석 요청 (ML API 호출)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
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

    // ML API 호출
    let prediction
    try {
      const mlResponse = await fetch(`${ML_API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id, features: {} }),
      })

      if (!mlResponse.ok) {
        throw new Error('ML API response not ok')
      }

      prediction = await mlResponse.json()
    } catch (mlError) {
      // ML API 연결 실패
      console.error('[Chamgab API] ML API error:', mlError)
      return NextResponse.json({ error: 'ML API unavailable' }, { status: 503 })
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
      console.error('[Chamgab API] DB save error:', error.message)
      return NextResponse.json({ error: 'Database error' }, { status: 503 })
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
