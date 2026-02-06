// @TASK P3-R4-T2 - Favorites API - 삭제

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
 * PATCH /api/favorites/:id
 * 알림 설정 토글
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase()
    const { id } = await params
    const body = await request.json()
    const { notify_enabled } = body

    if (typeof notify_enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'notify_enabled must be a boolean' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('favorites')
      .update({ notify_enabled })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update favorite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ favorite: data })
  } catch (error) {
    console.error('[Favorites API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/favorites/:id
 * 관심 매물 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase()
    const { id } = await params

    const { error } = await supabase.from('favorites').delete().eq('id', id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete favorite' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Favorites API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
