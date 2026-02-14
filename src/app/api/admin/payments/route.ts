export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../_utils'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const page = Math.max(Number(req.nextUrl.searchParams.get('page') || 1), 1)
  const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 50)
  const limit = Math.min(Math.max(limitRaw, 1), 200)
  const from = (page - 1) * limit
  const to = from + limit - 1

  try {
    const admin = createAdminClient()
    const { data, error, count } = await admin
      .from('payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      page,
      limit,
      total: count ?? null,
      rows: data || [],
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
