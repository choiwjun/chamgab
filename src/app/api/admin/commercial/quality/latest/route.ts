export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../_utils'
import {
  COMMERCIAL_CALIBRATION_VERSION,
  COMMERCIAL_QUALITY_VERSION,
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
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.res
  }

  try {
    const snapshot = (await getLatestCommercialQualitySnapshot()) as
      | Record<string, unknown>
      | null

    if (!snapshot) {
      return NextResponse.json(
        {
          as_of: new Date().toISOString(),
          error: 'snapshot_missing',
          pass: false,
          checks: [],
          metrics: null,
          quality_version: COMMERCIAL_QUALITY_VERSION,
          calibration_version: COMMERCIAL_CALIBRATION_VERSION,
        },
        { status: 404 }
      )
    }

    const gate = evaluateCommercialSnapshotGate(snapshot)
    return NextResponse.json({
      as_of: new Date().toISOString(),
      pass: gate.pass,
      checks: gate.checks,
      metrics: gate.metrics,
      snapshot,
      quality_version: COMMERCIAL_QUALITY_VERSION,
      calibration_version: COMMERCIAL_CALIBRATION_VERSION,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'failed to read commercial quality snapshot',
      },
      { status: 500 }
    )
  }
}
