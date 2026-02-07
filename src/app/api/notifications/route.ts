// @TASK P6-NOTIF - Notifications API
// @SPEC supabase/migrations/010 - notifications table

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/notifications
 *
 * 사용자 알림 목록 조회 (인증 필수)
 *
 * Query Parameters:
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지 사이즈 (기본: 20, 최대: 50)
 * - unread_only: 읽지 않은 알림만 조회 (기본: false)
 *
 * Response:
 * {
 *   notifications: Notification[],
 *   total: number,
 *   unread_count: number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('limit') || '20'))
    )
    const unreadOnly = searchParams.get('unread_only') === 'true'

    const offset = (page - 1) * limit

    // 알림 목록 조회
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, count, error } = await query

    if (error) {
      console.error('[Notifications API] Query error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      )
    }

    // 읽지 않은 알림 수 별도 조회
    const { count: unreadCount, error: unreadError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (unreadError) {
      console.error('[Notifications API] Unread count error:', unreadError)
    }

    return NextResponse.json({
      notifications: data || [],
      total: count || 0,
      unread_count: unreadCount || 0,
    })
  } catch (error) {
    console.error('[Notifications API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/notifications
 *
 * 알림 읽음 처리 (인증 필수)
 *
 * Request Body:
 * - { ids: string[] } - 특정 알림들을 읽음 처리
 * - { all: true } - 모든 알림을 읽음 처리
 *
 * Response:
 * { updated: number }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 인증 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ids, all } = body as { ids?: string[]; all?: boolean }

    // 입력 검증: ids 또는 all 중 하나 필수
    if (!all && (!ids || !Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json(
        { error: 'Either "ids" (non-empty array) or "all: true" is required' },
        { status: 400 }
      )
    }

    // ids 개수 제한 (대량 요청 방지)
    if (ids && ids.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 ids per request' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false) // 이미 읽은 알림은 건너뜀

    if (!all && ids) {
      query = query.in('id', ids)
    }

    const { data, error } = await query.select('id')

    if (error) {
      console.error('[Notifications API] Update error:', error)
      return NextResponse.json(
        { error: 'Failed to update notifications' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      updated: data?.length || 0,
    })
  } catch (error) {
    console.error('[Notifications API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
