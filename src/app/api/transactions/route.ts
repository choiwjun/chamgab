// @TASK P3-R3-T2 - Transactions API
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/**
 * GET /api/transactions
 * 거래 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const complex_id = searchParams.get('complex_id')
    const property_id = searchParams.get('property_id')
    const distinctAreas = searchParams.get('distinct_areas') === 'true'

    // distinct_areas 모드: 단지의 고유 전용면적 목록 반환
    if (distinctAreas && complex_id) {
      const { data, error } = await supabase
        .from('transactions')
        .select('area_exclusive')
        .eq('complex_id', complex_id)
        .not('area_exclusive', 'is', null)
        .order('area_exclusive', { ascending: true })

      if (error) {
        return NextResponse.json({ areas: [] }, { status: 503 })
      }

      const unique = Array.from(
        new Set((data || []).map((r) => r.area_exclusive as number))
      )
      return NextResponse.json({ areas: unique })
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    let query = supabase.from('transactions').select('*', { count: 'exact' })

    if (complex_id) {
      query = query.eq('complex_id', complex_id)
    }
    if (property_id) {
      query = query.eq('property_id', property_id)
    }

    const offset = (page - 1) * limit
    query = query
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      console.error('[Transactions API] Supabase error:', error.message)
      return NextResponse.json(
        { items: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    console.error('[Transactions API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
