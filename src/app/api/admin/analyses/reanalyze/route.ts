export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog, requireAdmin } from '../../_utils'

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  if (gate.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const propertyId = (body?.property_id as string | undefined)?.trim()
  if (!propertyId)
    return NextResponse.json(
      { error: 'property_id is required' },
      { status: 400 }
    )

  const admin = createAdminClient()

  // ML API call
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const mlRes = await fetch(`${ML_API_URL}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId, features: {} }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!mlRes.ok) {
      const text = await mlRes.text().catch(() => '')
      await admin.from('chamgab_analysis_events').insert({
        property_id: propertyId,
        actor_user_id: gate.userId,
        status: 'error',
        http_status: mlRes.status,
        error_code: 'ML_API_ERROR',
        error_message: text || 'ML API response not ok',
        request: { property_id: propertyId, force: true },
      })
      return NextResponse.json({ error: 'ML API error' }, { status: 502 })
    }

    const prediction = await mlRes.json()

    const { data: analysis, error: saveErr } = await admin
      .from('chamgab_analyses')
      .insert({
        property_id: propertyId,
        user_id: gate.userId,
        chamgab_price: prediction.chamgab_price,
        min_price: prediction.min_price,
        max_price: prediction.max_price,
        confidence: prediction.confidence,
      })
      .select()
      .single()

    if (saveErr)
      return NextResponse.json({ error: saveErr.message }, { status: 500 })

    await admin.from('chamgab_analysis_events').insert({
      property_id: propertyId,
      analysis_id: analysis.id,
      actor_user_id: gate.userId,
      status: 'success',
      http_status: 200,
      request: { property_id: propertyId, force: true },
    })

    await auditLog({
      actorUserId: gate.userId,
      actorEmail: gate.email,
      action: 'admin.chamgab.reanalyze',
      targetTable: 'properties',
      targetId: propertyId,
      request: { property_id: propertyId },
    })

    return NextResponse.json({ analysis })
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === 'AbortError'
    await admin.from('chamgab_analysis_events').insert({
      property_id: propertyId,
      actor_user_id: gate.userId,
      status: isTimeout ? 'timeout' : 'error',
      http_status: isTimeout ? 504 : 503,
      error_code: isTimeout ? 'TIMEOUT' : 'ML_UNAVAILABLE',
      error_message: isTimeout ? 'timeout' : 'ml unavailable',
      request: { property_id: propertyId, force: true },
    })
    return NextResponse.json(
      { error: isTimeout ? 'Timeout' : 'ML API unavailable' },
      { status: isTimeout ? 504 : 503 }
    )
  }
}
