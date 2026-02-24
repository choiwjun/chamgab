export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  COMMERCIAL_THRESHOLDS,
  evaluateCommercialSnapshotGate,
  getLatestCommercialQualitySnapshot,
} from '@/app/api/admin/commercial/quality/_snapshot'

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
    const commercialGate = evaluateCommercialSnapshotGate(snapshot)
    const commercialStatus = commercialGate.pass ? 'GO' : 'NO_GO'

    return NextResponse.json({
      as_of: new Date().toISOString(),
      status: {
        apartment: 'NO_GO',
        commercial: commercialStatus,
        school: 'NO_GO',
        land: 'NO_GO',
        overall: commercialGate.pass ? 'GO_LIMITED' : 'NO_GO',
      },
      overall_paid_readiness: commercialGate.pass ? 'GO_WARN' : 'NO_GO',
      apartment: {
        checks: [],
        metrics: null,
        thresholds: null,
      },
      commercial: {
        checks: commercialGate.checks,
        metrics: commercialGate.metrics,
        thresholds: COMMERCIAL_THRESHOLDS,
      },
      school: {
        checks: [],
        metrics: null,
        thresholds: null,
      },
      land: {
        checks: [],
        metrics: null,
        thresholds: null,
      },
      missing_metrics: snapshot ? [] : ['commercial_snapshot_missing'],
      note: 'Commercial snapshot 기반 최소 게이트 응답입니다. Apartment/School/Land 블록은 후속 확장 대상입니다.',
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'launch readiness check failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
