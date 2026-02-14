export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'

const ML_API_URL = process.env.ML_API_URL || ''

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (!ML_API_URL) {
    return NextResponse.json(
      {
        error: 'ML_API_URL not configured',
        configured: false,
      },
      { status: 500 }
    )
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const token = process.env.ML_ADMIN_TOKEN || ''
    const res = await fetch(`${ML_API_URL}/health`, {
      signal: controller.signal,
      headers: token ? { 'X-Admin-Token': token } : {},
      cache: 'no-store',
    })
    clearTimeout(timeout)

    const data = await res.json().catch(() => ({}))
    const obj =
      typeof data === 'object' && data
        ? (data as Record<string, unknown>)
        : null
    const models = obj?.models as Record<string, unknown> | undefined
    const hasModels = !!models && typeof models === 'object'
    const compat = hasModels && typeof models?.business_model === 'boolean'

    return NextResponse.json(
      {
        configured: true,
        ml_api_url: ML_API_URL,
        compat,
        ...(obj ? obj : { raw: data }),
      },
      { status: res.status }
    )
  } catch {
    return NextResponse.json(
      {
        error: 'ML API unavailable',
        configured: true,
        ml_api_url: ML_API_URL,
        compat: false,
      },
      { status: 503 }
    )
  }
}
