export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../_utils'
import {
  computeCommercialQualitySnapshot,
  evaluateCommercialSnapshotGate,
  insertCommercialQualitySnapshot,
} from '../_snapshot'

function hasInternalAdminToken(req: NextRequest): boolean {
  const expected =
    process.env.ADMIN_API_TOKEN ||
    process.env.ML_ADMIN_TOKEN ||
    process.env.SCHEDULER_ADMIN_TOKEN ||
    ''
  const provided = req.headers.get('x-admin-token') || ''
  if (!expected || !provided) return false

  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length) return false

  try {
    return timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (!hasInternalAdminToken(req)) {
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.res
  }

  try {
    const search = req.nextUrl.searchParams
    const dryRun = search.get('dry_run') === '1' || search.get('dry_run') === 'true'

    const payload = await computeCommercialQualitySnapshot()
    const snapshot = dryRun ? payload : await insertCommercialQualitySnapshot(payload)
    const evaluated = evaluateCommercialSnapshotGate(snapshot as Record<string, unknown>)

    return NextResponse.json(
      {
        as_of: new Date().toISOString(),
        mode: dryRun ? 'dry_run' : 'persisted',
        status: evaluated.pass ? 'GO' : 'NO_GO',
        commercial: {
          pass: evaluated.pass,
          checks: evaluated.checks,
          metrics: evaluated.metrics,
          snapshot,
        },
      },
      { status: dryRun ? 200 : 201 }
    )
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'commercial quality recompute failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
