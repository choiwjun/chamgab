// @TASK P3-R4-T2 - Favorites API
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/favorites
 * 관심 매물 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    // 인증 확인 (실제로는 서버 클라이언트 사용)
    // const supabaseServer = await createServerClient()
    // const { data: { user } } = await supabaseServer.auth.getUser()

    // Mock: 인증 없이 조회 (개발용)
    const mockUserId = searchParams.get('user_id') || 'mock-user'

    const offset = (page - 1) * limit

    const { data, count, error } = await supabase
      .from('favorites')
      .select('*, properties(*)', { count: 'exact' })
      .eq('user_id', mockUserId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      // Mock 데이터 반환
      return NextResponse.json({
        items: [],
        total: 0,
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
    console.error('[Favorites API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/favorites
 * 관심 매물 추가
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { property_id, user_id } = body

    if (!property_id) {
      return NextResponse.json(
        { error: 'property_id is required' },
        { status: 400 }
      )
    }

    // Mock: 인증 없이 추가 (개발용)
    const userId = user_id || 'mock-user'

    // 중복 확인
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('property_id', property_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Already in favorites', id: existing.id },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, property_id })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to add favorite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ favorite: data }, { status: 201 })
  } catch (error) {
    console.error('[Favorites API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
