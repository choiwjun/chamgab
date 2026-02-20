export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../../_utils'

type Action = 'cancel' | 'expire'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const action = (body?.action as Action | undefined)?.trim()
  const subscriptionId = (body?.subscription_id as string | undefined)?.trim()
  const immediate = body?.immediate as boolean | undefined

  if (!action || !subscriptionId) {
    return NextResponse.json(
      { error: 'action and subscription_id are required' },
      { status: 400 }
    )
  }

  try {
    const admin = createAdminClient()

    if (action === 'cancel') {
      const { error } = await admin.rpc('admin_force_cancel_subscription', {
        p_subscription_id: subscriptionId,
        p_immediate: immediate !== false,
      })
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 })

      await auditLog({
        actorUserId: gate.userId,
        actorEmail: gate.email,
        action: 'admin.subscriptions.force_cancel',
        targetTable: 'subscriptions',
        targetId: subscriptionId,
        request: { immediate: immediate !== false },
      })

      return NextResponse.json({ ok: true })
    }

    if (action === 'expire') {
      const { error } = await admin.rpc('admin_force_expire_subscription', {
        p_subscription_id: subscriptionId,
      })
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 })

      await auditLog({
        actorUserId: gate.userId,
        actorEmail: gate.email,
        action: 'admin.subscriptions.force_expire',
        targetTable: 'subscriptions',
        targetId: subscriptionId,
        request: {},
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
