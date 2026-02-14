export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../../_utils'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const body = await req.json().catch(() => null)
  const userId = body?.user_id as string | undefined
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { error } = await admin
      .from('user_profiles')
      .update({ force_logout_at: now })
      .eq('id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await auditLog({
      actorUserId: gate.userId,
      actorEmail: gate.email,
      action: 'admin.user.force_logout',
      targetTable: 'user_profiles',
      targetId: userId,
      request: { force_logout_at: now },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
