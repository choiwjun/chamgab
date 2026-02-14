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
