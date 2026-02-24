export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  evaluateCommercialSnapshotGate,
  getLatestCommercialQualitySnapshot,
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

export async function GET(req: NextRequest) {
  if (!hasInternalAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const snapshot = await getLatestCommercialQualitySnapshot()
    if (!snapshot) {
      return NextResponse.json(
        {
          as_of: new Date().toISOString(),
          status: 'NO_GO',
          message: 'No commercial quality snapshot found',
          commercial: {
            pass: false,
            checks: [],
            metrics: null,
            snapshot: null,
          },
        },
        { status: 200 }
      )
    }

    const evaluated = evaluateCommercialSnapshotGate(snapshot)
    return NextResponse.json({
      as_of: new Date().toISOString(),
      status: evaluated.pass ? 'GO' : 'NO_GO',
      commercial: {
        pass: evaluated.pass,
        checks: evaluated.checks,
        metrics: evaluated.metrics,
        snapshot,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'commercial quality latest fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
