export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  evaluateCommercialSnapshotGate,
  getLatestCommercialQualitySnapshot,
  toCommercialGateStatus,
} from '@/app/api/admin/commercial/quality/_snapshot'

type GateStatus = 'PASS' | 'WARN' | 'FAIL'
type DomainKey = 'apartment' | 'commercial' | 'school' | 'land'

type GatePayload = {
  as_of?: string
  status?: Partial<Record<DomainKey | 'overall', GateStatus>>
}

const LAUNCH_READINESS_TIMEOUT_MS = 8_000

function buildUnavailablePayload(reason: string) {
  return {
    as_of: new Date().toISOString(),
    status: {
      apartment: 'WARN' as GateStatus,
      commercial: 'WARN' as GateStatus,
      school: 'WARN' as GateStatus,
      land: 'WARN' as GateStatus,
      overall: 'WARN' as GateStatus,
    },
    locked: {
      apartment: false,
      commercial: false,
      school: false,
      land: false,
    },
    reason,
  }
}

async function applyLocalOverrides(
  status: Partial<Record<DomainKey | 'overall', GateStatus>>
): Promise<Partial<Record<DomainKey | 'overall', GateStatus>>> {
  const merged = { ...status }
  try {
    const snapshot = await getLatestCommercialQualitySnapshot()
    if (!snapshot) {
      merged.commercial = merged.commercial ?? 'WARN'
      return merged
    }
    const commercialGate = evaluateCommercialSnapshotGate(
      (snapshot as Record<string, unknown> | null) ?? null
    )
    if (commercialGate.checks.length === 0) {
      merged.commercial = merged.commercial ?? 'WARN'
      return merged
    }
    merged.commercial = toCommercialGateStatus(commercialGate.checks, 'FAIL')
  } catch {
    // Keep upstream status on local override errors.
  }
  return merged
}

function resolveBaseUrl(req: NextRequest): string {
  const explicit =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.WEB_BASE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  return req.nextUrl.origin
}

function resolveAdminToken(): string | null {
  return (
    process.env.ADMIN_API_TOKEN ||
    process.env.ML_ADMIN_TOKEN ||
    process.env.SCHEDULER_ADMIN_TOKEN ||
    null
  )
}

function toLocked(status: GatePayload['status']) {
  const safe = status || {}
  // Lock only explicit FAIL domains. WARN should remain accessible.
  const lockIfFail = (key: DomainKey) => safe[key] === 'FAIL'
  return {
    apartment: lockIfFail('apartment'),
    commercial: lockIfFail('commercial'),
    school: lockIfFail('school'),
    land: lockIfFail('land'),
  }
}

export async function GET(req: NextRequest) {
  const baseUrl = resolveBaseUrl(req)
  const token = resolveAdminToken()

  if (!token) {
    return NextResponse.json(buildUnavailablePayload('admin_token_missing'), {
      headers: { 'cache-control': 'no-store' },
    })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      LAUNCH_READINESS_TIMEOUT_MS
    )
    let res: Response
    try {
      res = await fetch(`${baseUrl}/api/admin/data-quality/launch-readiness`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-admin-token': token,
        },
        cache: 'no-store',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      return NextResponse.json(
        buildUnavailablePayload(`launch_readiness_http_${res.status}`),
        { headers: { 'cache-control': 'no-store' } }
      )
    }

    const payload = (await res.json()) as GatePayload
    const status = await applyLocalOverrides(payload.status || {})
    return NextResponse.json(
      {
        as_of: payload.as_of || new Date().toISOString(),
        status,
        locked: toLocked(status),
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
      }
    )
  } catch (error) {
    const isAbort =
      typeof error === 'object' &&
      error != null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
    const message = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json(
      buildUnavailablePayload(
        isAbort
          ? `launch_readiness_timeout_${LAUNCH_READINESS_TIMEOUT_MS}ms`
          : `launch_readiness_fetch_failed:${message}`
      ),
      { headers: { 'cache-control': 'no-store' } }
    )
  }
}
