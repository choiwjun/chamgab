export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../../_utils'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const body = await req.json().catch(() => null)
  const userId = body?.user_id as string | undefined
  const amount = body?.amount as number | undefined
  const reason = (body?.reason as string | undefined) || 'admin_grant'

  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json(
      { error: 'amount (non-zero number) is required' },
      { status: 400 }
    )
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc('admin_grant_bonus_credits', {
      p_user_id: userId,
      p_amount: Math.trunc(amount),
      p_reason: reason,
      p_meta: { via: 'admin', actor: gate.userId },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await auditLog({
      actorUserId: gate.userId,
      actorEmail: gate.email,
      action: 'admin.user.bonus_credits.grant',
      targetTable: 'user_profiles',
      targetId: userId,
      request: { amount, reason },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
