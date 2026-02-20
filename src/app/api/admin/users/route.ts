// Admin API: list/update user profiles (server-only).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../_utils'

type UserProfileRow = {
  id: string
  email: string
  name: string | null
  tier: 'free' | 'premium' | 'business'
  daily_analysis_count: number
  daily_analysis_limit: number
  daily_credit_used?: number
  daily_credit_limit?: number
  monthly_credit_used?: number
  monthly_credit_limit?: number
  bonus_credits?: number
  force_logout_at?: string | null
  is_suspended?: boolean
  suspended_until?: string | null
  suspended_reason?: string | null
  created_at: string
  updated_at: string
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get('limit') || 100),
    200
  )

  try {
    const admin = createAdminClient()
    let query = admin
      .from('user_profiles')
      .select(
        'id,email,name,tier,daily_analysis_count,daily_analysis_limit,daily_credit_used,daily_credit_limit,monthly_credit_used,monthly_credit_limit,bonus_credits,force_logout_at,is_suspended,suspended_until,suspended_reason,created_at,updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    if (q) {
      // supabase-js doesn't support OR with ilike nicely; use a broad email search first.
      query = query.ilike('email', `%${q}%`)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ users: (data || []) as UserProfileRow[] })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const body = await req.json().catch(() => null)
  const userId = body?.user_id as string | undefined
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  const patch: Partial<
    Pick<
      UserProfileRow,
      | 'tier'
      | 'daily_analysis_limit'
      | 'daily_analysis_count'
      | 'daily_credit_limit'
      | 'daily_credit_used'
      | 'monthly_credit_limit'
      | 'monthly_credit_used'
    >
  > = {}
  if (body.tier) patch.tier = body.tier
  if (typeof body.daily_analysis_limit === 'number')
    patch.daily_analysis_limit = body.daily_analysis_limit
  if (typeof body.daily_analysis_count === 'number')
    patch.daily_analysis_count = body.daily_analysis_count
  if (typeof body.daily_credit_limit === 'number')
    patch.daily_credit_limit = body.daily_credit_limit
  if (typeof body.daily_credit_used === 'number')
    patch.daily_credit_used = body.daily_credit_used
  if (typeof body.monthly_credit_limit === 'number')
    patch.monthly_credit_limit = body.monthly_credit_limit
  if (typeof body.monthly_credit_used === 'number')
    patch.monthly_credit_used = body.monthly_credit_used
  // bonus_credits must be adjusted via RPC to keep a ledger (see /api/admin/users/bonus-credits).

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select(
        'id,email,name,tier,daily_analysis_count,daily_analysis_limit,daily_credit_used,daily_credit_limit,monthly_credit_used,monthly_credit_limit,bonus_credits,force_logout_at,is_suspended,suspended_until,suspended_reason,created_at,updated_at'
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await auditLog({
      actorUserId: gate.userId,
      actorEmail: gate.email,
      action: 'admin.user_profiles.update',
      targetTable: 'user_profiles',
      targetId: userId,
      request: patch,
    })

    return NextResponse.json({ user: data as UserProfileRow })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
