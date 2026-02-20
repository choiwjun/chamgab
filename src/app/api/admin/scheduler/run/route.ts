export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auditLog, requireAdmin } from '../../_utils'

const ML_API_URL = process.env.ML_API_URL || ''

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const jobType = (body?.job_type as string | undefined)?.trim()
  if (!jobType)
    return NextResponse.json({ error: 'job_type is required' }, { status: 400 })

  const token = process.env.ML_ADMIN_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'ML_ADMIN_TOKEN not configured' },
      { status: 500 }
    )
  }
  if (!ML_API_URL) {
    return NextResponse.json(
      { error: 'ML_API_URL not configured' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(`${ML_API_URL}/api/scheduler/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ job_type: jobType }),
    })
    const data = await res.json().catch(() => ({}))

    if (res.ok) {
      await auditLog({
        actorUserId: gate.userId,
        actorEmail: gate.email,
        action: 'admin.scheduler.run',
        targetTable: 'ml_api',
        targetId: jobType,
        request: { job_type: jobType },
      })
    }

    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'ML API unavailable' }, { status: 503 })
  }
}
