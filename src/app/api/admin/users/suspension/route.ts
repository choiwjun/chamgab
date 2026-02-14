export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../../_utils'

type Action = 'suspend' | 'unsuspend'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const userId = (body?.user_id as string | undefined)?.trim()
  const action = (body?.action as Action | undefined)?.trim()
  const banDuration = (body?.ban_duration as string | undefined)?.trim()
  const reason = (body?.reason as string | undefined)?.trim()

  if (!userId || !action) {
    return NextResponse.json(
      { error: 'user_id and action are required' },
      { status: 400 }
    )
  }

  try {
    const admin = createAdminClient()

    if (action === 'suspend') {
      const dur = banDuration || '720h' // 30d default
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: dur,
      })
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 })

      const bannedUntil = data.user?.banned_until || null
      const { error: profErr } = await admin
        .from('user_profiles')
        .update({
          is_suspended: true,
          suspended_until: bannedUntil,
          suspended_reason: reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (profErr)
        return NextResponse.json({ error: profErr.message }, { status: 500 })

      await auditLog({
        actorUserId: gate.userId,
        actorEmail: gate.email,
        action: 'admin.user.suspend',
        targetTable: 'auth.users',
        targetId: userId,
        request: {
          ban_duration: dur,
          reason: reason || null,
          banned_until: bannedUntil,
        },
      })

      return NextResponse.json({ ok: true, banned_until: bannedUntil })
    }

    if (action === 'unsuspend') {
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      })
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 })

      const { error: profErr } = await admin
        .from('user_profiles')
        .update({
          is_suspended: false,
          suspended_until: null,
          suspended_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
      if (profErr)
        return NextResponse.json({ error: profErr.message }, { status: 500 })

      await auditLog({
        actorUserId: gate.userId,
        actorEmail: gate.email,
        action: 'admin.user.unsuspend',
        targetTable: 'auth.users',
        targetId: userId,
        request: { banned_until: data.user?.banned_until || null },
      })

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
