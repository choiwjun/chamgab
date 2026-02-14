export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'

const ML_API_URL = process.env.ML_API_URL || ''

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const token = process.env.ML_ADMIN_TOKEN || ''
  if (!ML_API_URL) {
    return NextResponse.json(
      { error: 'ML_API_URL not configured' },
      { status: 500 }
    )
  }
  try {
    const res = await fetch(`${ML_API_URL}/api/scheduler/status`, {
      headers: token ? { 'X-Admin-Token': token } : {},
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'ML API unavailable' }, { status: 503 })
  }
}
