// @TASK P3-R4-T2 - Favorites API

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/favorites
 * 관심 매물 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 인증 확인 - 비로그인 시 빈 목록 반환 (401 대신)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ items: [], total: 0, page: 1, limit: 20 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const offset = (page - 1) * limit

    const { data, count, error } = await supabase
      .from('favorites')
      .select('*, properties(*)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[Favorites API] Supabase query error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch favorites' },
        { status: 500 }
      )
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
    const supabase = await createClient()

    // 인증 확인
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { property_id } = body

    if (!property_id) {
      return NextResponse.json(
        { error: 'property_id is required' },
        { status: 400 }
      )
    }

    // 중복 확인
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
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
      .insert({ user_id: user.id, property_id })
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
