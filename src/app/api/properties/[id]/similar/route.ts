// @TASK P3-R3-T2 - Similar Transactions API

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
 * 유사도 계산 함수
 * 거리, 면적, 년식 기반 유사도 점수 (0~100)
 */
function calculateSimilarity(
  target: {
    area?: number
    built_year?: number
    complex_id?: string | null
    eupmyeondong?: string | null
  },
  transaction: {
    area_exclusive?: number | null
    floor?: number | null
    built_year?: number | null
    complex_id?: string | null
    dong?: string | null
  }
): number {
  const sameComplex =
    !!target.complex_id &&
    !!transaction.complex_id &&
    target.complex_id === transaction.complex_id

  // 같은 단지가 아니면 100% 유사도로 보이지 않게 제한
  let score = sameComplex ? 100 : 85

  // 면적 차이 (10% 당 -10점)
  if (target.area && transaction.area_exclusive) {
    const areaDiff =
      Math.abs(target.area - transaction.area_exclusive) / target.area
    score -= Math.min(areaDiff * 120, 30)
  }

  // 년식(준공) 차이
  if (target.built_year && transaction.built_year) {
    const yearDiff = Math.abs(target.built_year - transaction.built_year)
    score -= Math.min(yearDiff * 1.5, 15)
  }

  // 동 힌트 (같은 단지가 아닌 경우에만 약하게 반영)
  if (!sameComplex && target.eupmyeondong && transaction.dong) {
    if (target.eupmyeondong === transaction.dong) score += 4
    else score -= 6
  }

  // 같은 단지가 아니면 "초록(>=90)"으로 보이지 않게 캡
  if (!sameComplex) score = Math.min(score, 89)

  return Math.max(Math.round(score), 50)
}

/**
 * GET /api/properties/:id/similar
 * 유사 거래 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase()
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20)

    // 대상 매물 조회
    const { data: property } = await supabase
      .from('properties')
      .select('*, complex_id')
      .eq('id', id)
      .single()

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // 유사 거래 조회: 같은 단지 → 같은 시군구+유사면적 → 같은 시군구 순으로 탐색
    let transactions = null
    let error = null

    const strictAreaMin = property.area_exclusive
      ? property.area_exclusive * 0.9
      : 0
    const strictAreaMax = property.area_exclusive
      ? property.area_exclusive * 1.1
      : 999

    // 1차: 같은 단지의 거래
    if (property.complex_id) {
      const result = await supabase
        .from('transactions')
        .select('*')
        .eq('complex_id', property.complex_id)
        .gte('area_exclusive', strictAreaMin)
        .lte('area_exclusive', strictAreaMax)
        .order('transaction_date', { ascending: false })
        .limit(limit)
      transactions = result.data
      error = result.error
    }

    // 1.5차: complex_id가 없거나 거래가 없으면 (apt_name + sigungu)로 같은 단지 거래를 먼저 시도
    if (
      (!transactions || transactions.length === 0) &&
      property.sigungu &&
      property.name
    ) {
      const exact = await supabase
        .from('transactions')
        .select('*')
        .eq('sigungu', property.sigungu)
        .eq('apt_name', property.name)
        .gte('area_exclusive', strictAreaMin)
        .lte('area_exclusive', strictAreaMax)
        .order('transaction_date', { ascending: false })
        .limit(limit)
      transactions = exact.data
      error = exact.error

      // 이름 표기가 조금 다른 경우를 대비한 부분일치 fallback
      if ((!transactions || transactions.length === 0) && !error) {
        const like = await supabase
          .from('transactions')
          .select('*')
          .eq('sigungu', property.sigungu)
          .ilike('apt_name', `%${property.name}%`)
          .gte('area_exclusive', strictAreaMin)
          .lte('area_exclusive', strictAreaMax)
          .order('transaction_date', { ascending: false })
          .limit(limit)
        transactions = like.data
        error = like.error
      }
    }

    // 2차: 같은 시군구에서 유사 면적 거래
    if ((!transactions || transactions.length === 0) && property.sigungu) {
      const areaMin = property.area_exclusive
        ? property.area_exclusive * 0.8
        : 0
      const areaMax = property.area_exclusive
        ? property.area_exclusive * 1.2
        : 999
      const result = await supabase
        .from('transactions')
        .select('*')
        .eq('sigungu', property.sigungu)
        .gte('area_exclusive', areaMin)
        .lte('area_exclusive', areaMax)
        .order('transaction_date', { ascending: false })
        .limit(limit)
      transactions = result.data
      error = result.error
    }

    // 3차: 같은 시군구 전체
    if ((!transactions || transactions.length === 0) && property.sigungu) {
      const result = await supabase
        .from('transactions')
        .select('*')
        .eq('sigungu', property.sigungu)
        .order('transaction_date', { ascending: false })
        .limit(limit)
      transactions = result.data
      error = result.error
    }

    if (error) {
      console.error('[Similar API] Supabase error:', error.message)
      return NextResponse.json(
        { transactions: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({
        transactions: [],
        total: 0,
      })
    }

    // 유사도 계산 추가
    const transactionsWithSimilarity = transactions.map((tx) => ({
      ...tx,
      similarity: calculateSimilarity(
        {
          area: property.area_exclusive,
          built_year: property.built_year,
          complex_id: property.complex_id,
          eupmyeondong: property.eupmyeondong,
        },
        tx
      ),
    }))

    // 유사도 순 정렬
    transactionsWithSimilarity.sort((a, b) => b.similarity - a.similarity)

    return NextResponse.json({
      transactions: transactionsWithSimilarity,
      total: transactionsWithSimilarity.length,
    })
  } catch (error) {
    console.error('[Similar API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
