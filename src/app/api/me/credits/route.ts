export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data: profile, error: pErr } = await supabase
    .from('user_profiles')
    .select(
      'tier,daily_credit_used,daily_credit_limit,daily_credit_reset_at,monthly_credit_used,monthly_credit_limit,monthly_credit_reset_at,bonus_credits'
    )
    .eq('id', user.id)
    .maybeSingle()

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }

  // Apply reset logic client-side (mirrors consume_user_credits RPC resets)
  // so the UI shows 0 when the reset date has passed.
  if (profile) {
    const today = new Date().toISOString().slice(0, 10)

    if (!profile.daily_credit_reset_at || profile.daily_credit_reset_at < today) {
      profile.daily_credit_used = 0
    }

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    if (
      !profile.monthly_credit_reset_at ||
      profile.monthly_credit_reset_at < monthStartStr
    ) {
      profile.monthly_credit_used = 0
    }
  }

  const { data: events } = await supabase
    .from('credit_events')
    .select('id,product,delta,reason,created_at,meta')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    user_id: user.id,
    profile: profile || null,
    recent_events: events || [],
  })
}
