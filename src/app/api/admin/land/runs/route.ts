export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../../_utils'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const status = req.nextUrl.searchParams.get('status')?.trim()
  const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 100)
  const limit = Math.min(Math.max(limitRaw, 1), 200)

  try {
    const admin = createAdminClient()
    let query = admin
      .from('land_collection_runs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
