export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../../_utils'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const propertyId = req.nextUrl.searchParams.get('property_id')?.trim()
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get('limit') || 10),
    50
  )

  if (!propertyId) {
    return NextResponse.json(
      { error: 'property_id is required' },
      { status: 400 }
    )
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('chamgab_analysis_events')
      .select(
        'id,status,http_status,error_code,error_message,created_at,analysis_id,actor_user_id,request'
      )
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ events: data || [] })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
