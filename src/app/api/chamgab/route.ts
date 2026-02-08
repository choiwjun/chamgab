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
 *
 * Body (둘 중 하나):
 *   - { property_id } — 매물 ID로 직접 분석
 *   - { complex_id, area_type, floor, dong?, direction? } — 단지 기반 분석
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const { property_id, complex_id, area_type, floor, dong, direction } = body

    if (!property_id && !complex_id) {
      return NextResponse.json(
        { error: 'property_id or complex_id is required' },
        { status: 400 }
      )
    }

    // complex_id → 해당 단지의 매물 ID 조회
    let resolvedPropertyId = property_id
    if (!resolvedPropertyId && complex_id) {
      const { data: property } = await supabase
        .from('properties')
        .select('id')
        .eq('complex_id', complex_id)
        .limit(1)
        .single()

      if (property) {
        resolvedPropertyId = property.id
      }
    }

    // 캐시된 분석 결과 확인
    if (resolvedPropertyId) {
      const { data: existingAnalysis } = await supabase
        .from('chamgab_analyses')
        .select('*')
        .eq('property_id', resolvedPropertyId)
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
    }

    // ML API에 넘길 features 구성
    const features: Record<string, unknown> = {}
    if (area_type) features.area_type = area_type
    if (floor) features.floor = floor
    if (dong) features.dong = dong
    if (direction) features.direction = direction
    if (complex_id) features.complex_id = complex_id

    // ML API 호출 (10초 타임아웃)
    let prediction
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const mlResponse = await fetch(`${ML_API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: resolvedPropertyId || complex_id,
          features,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!mlResponse.ok) {
        throw new Error('ML API response not ok')
      }

      prediction = await mlResponse.json()
    } catch (mlError) {
      console.error('[Chamgab API] ML API error:', mlError)
      const isTimeout =
        mlError instanceof DOMException && mlError.name === 'AbortError'
      return NextResponse.json(
        {
          error: isTimeout
            ? '분석 요청 시간이 초과되었습니다.'
            : 'ML API unavailable',
        },
        { status: isTimeout ? 504 : 503 }
      )
    }

    // 분석 결과 저장 (resolvedPropertyId가 있을 때만)
    if (resolvedPropertyId) {
      const { data: newAnalysis, error } = await supabase
        .from('chamgab_analyses')
        .insert({
          property_id: resolvedPropertyId,
          chamgab_price: prediction.chamgab_price,
          min_price: prediction.min_price,
          max_price: prediction.max_price,
          confidence: prediction.confidence,
        })
        .select()
        .single()

      if (error) {
        console.error('[Chamgab API] DB save error:', error.message)
        return NextResponse.json({ analysis: prediction, saved: false })
      }

      return NextResponse.json({ analysis: newAnalysis, saved: true })
    }

    // 매칭 매물이 없으면 예측 결과만 반환
    return NextResponse.json({ analysis: prediction, saved: false })
  } catch (error) {
    console.error('[Chamgab API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
