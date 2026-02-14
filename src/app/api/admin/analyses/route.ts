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

  const propertyId = req.nextUrl.searchParams.get('property_id')?.trim()
  const userId = req.nextUrl.searchParams.get('user_id')?.trim()

  try {
    const admin = createAdminClient()
    let query = admin
      .from('chamgab_analyses')
      .select(
        'id,property_id,user_id,chamgab_price,min_price,max_price,confidence,analyzed_at,expires_at,created_at,properties(name,address,complex_id,area_exclusive)',
        { count: 'exact' }
      )
      .order('analyzed_at', { ascending: false })
      .range(from, to)

    if (propertyId) query = query.eq('property_id', propertyId)
    if (userId) query = query.eq('user_id', userId)

    const { data, error, count } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data || []) as Record<string, unknown>[]
    const propertyIds = Array.from(
      new Set(rows.map((r) => r.property_id).filter(Boolean))
    )

    // Best-effort: attach latest transaction price for quick sanity checks.
    // 1) Prefer exact property_id match; 2) fallback to same complex_id with area within +/-10%.
    const txByProperty: Record<string, Record<string, unknown>> = {}
    if (propertyIds.length) {
      const { data: txs } = await admin
        .from('transactions')
        .select('property_id,complex_id,transaction_date,price,area_exclusive')
        .in('property_id', propertyIds)
        .order('transaction_date', { ascending: false })
        .limit(Math.min(propertyIds.length * 5, 500))

      ;(txs || []).forEach((t: Record<string, unknown>) => {
        if (t?.property_id && !txByProperty[t.property_id])
          txByProperty[t.property_id] = t
      })
    }

    const missing = rows
      .filter((r) => r.property_id && !txByProperty[r.property_id])
      .map((r) => ({
        property_id: r.property_id as string,
        complex_id: r.properties?.complex_id as string | null,
        area_exclusive: r.properties?.area_exclusive as number | null,
      }))
      .filter((x) => !!x.complex_id && typeof x.area_exclusive === 'number')

    if (missing.length) {
      const complexIds = Array.from(
        new Set(missing.map((m) => m.complex_id).filter(Boolean))
      )
      const { data: txs2 } = await admin
        .from('transactions')
        .select('property_id,complex_id,transaction_date,price,area_exclusive')
        .in('complex_id', complexIds as string[])
        .order('transaction_date', { ascending: false })
        .limit(1000)

      const byComplex = new Map<string, Record<string, unknown>[]>()
      ;(txs2 || []).forEach((t: Record<string, unknown>) => {
        if (!t?.complex_id) return
        const arr = byComplex.get(t.complex_id) || []
        arr.push(t)
        byComplex.set(t.complex_id, arr)
      })

      missing.forEach((m) => {
        const txs = byComplex.get(m.complex_id!) || []
        const area = m.area_exclusive as number
        const minA = area * 0.9
        const maxA = area * 1.1
        const hit = txs.find(
          (t) =>
            typeof t.area_exclusive === 'number' &&
            t.area_exclusive >= minA &&
            t.area_exclusive <= maxA
        )
        if (hit) txByProperty[m.property_id] = hit
      })
    }

    // Batch fetch latest failure event per property (so the UI shows meaningful reasons).
    const eventByProperty: Record<string, Record<string, unknown>> = {}
    if (propertyIds.length) {
      const { data: events } = await admin
        .from('chamgab_analysis_events')
        .select(
          'property_id,status,http_status,error_code,error_message,created_at'
        )
        .in('property_id', propertyIds)
        .in('status', ['error', 'timeout'])
        .order('created_at', { ascending: false })
        .limit(Math.min(propertyIds.length * 3, 500))
      ;(events || []).forEach((e: Record<string, unknown>) => {
        if (!eventByProperty[e.property_id]) eventByProperty[e.property_id] = e
      })
    }

    return NextResponse.json({
      page,
      limit,
      total: count ?? null,
      rows: rows.map((r) => ({
        ...r,
        latest_tx: txByProperty[r.property_id] || null,
        gap_pct: txByProperty[r.property_id]?.price
          ? Math.round(
              ((Number(r.chamgab_price) -
                Number(txByProperty[r.property_id].price)) /
                Number(txByProperty[r.property_id].price)) *
                1000
            ) / 10
          : null,
        last_event: eventByProperty[r.property_id] || null,
      })),
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
