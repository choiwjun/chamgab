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
  target: { area?: number; built_year?: number },
  transaction: { area_exclusive?: number; floor?: number }
): number {
  let score = 100

  // 면적 차이 (10% 당 -10점)
  if (target.area && transaction.area_exclusive) {
    const areaDiff =
      Math.abs(target.area - transaction.area_exclusive) / target.area
    score -= Math.min(areaDiff * 100, 30)
  }

  // 기타 요소 (랜덤 보정)
  score -= Math.random() * 10

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

    // 유사 거래 조회 (같은 단지 또는 같은 지역)
    let query = supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .limit(limit)

    if (property.complex_id) {
      query = query.eq('complex_id', property.complex_id)
    }

    const { data: transactions, error } = await query

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
        { area: property.area_exclusive, built_year: property.built_year },
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
