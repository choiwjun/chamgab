// @TASK P3-R3-T2 - Transactions API
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/transactions
 * 거래 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const complex_id = searchParams.get('complex_id')
    const property_id = searchParams.get('property_id')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })

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
      // Mock 데이터 반환
      const mockTransactions = Array.from({ length: 5 }, (_, i) => ({
        id: `mock-tx-${i}`,
        complex_id,
        property_id,
        transaction_date: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        price: 800000000 + Math.floor(Math.random() * 200000000),
        area_exclusive: 84.5 + Math.random() * 30,
        floor: Math.floor(Math.random() * 20) + 1,
        created_at: new Date().toISOString(),
      }))

      return NextResponse.json({
        items: mockTransactions,
        total: 5,
        page,
        limit,
        is_mock: true,
      })
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
