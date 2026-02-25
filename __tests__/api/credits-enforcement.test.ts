import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

function setupCreditFailureMock() {
  vi.doMock('@/lib/credits/consume', () => {
    class MockCreditConsumeError extends Error {
      code: 'credit_rpc_error' | 'insufficient_credits'
      status: number
      quota: Record<string, number | boolean> | null

      constructor() {
        super('Insufficient credits')
        this.name = 'CreditConsumeError'
        this.code = 'insufficient_credits'
        this.status = 429
        this.quota = {
          allowed: false,
          daily_remaining: 0,
          monthly_remaining: 0,
          bonus_remaining: 0,
          total_remaining: 0,
        }
      }
    }

    return {
      CreditConsumeError: MockCreditConsumeError,
      consumeCredits: vi.fn(async () => {
        throw new MockCreditConsumeError()
      }),
      insufficientCreditsPayload: vi.fn((quota) => ({
        error: 'insufficient_credits',
        code: 'insufficient_credits',
        legacy_code: 'CREDITS_EXCEEDED',
        quota,
      })),
    }
  })
}

describe('4-menu credit enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    process.env.FREE_OPEN_MODE = 'false'
    process.env.NEXT_PUBLIC_FREE_OPEN_MODE = 'false'
  })

  it('POST /api/chamgab returns insufficient_credits on quota fail', async () => {
    setupCreditFailureMock()

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'user-1' } },
            error: null,
          })),
        },
      })),
    }))

    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(() => ({
        from: vi.fn(() => ({
          insert: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    }))

    const { POST } = await import('@/app/api/chamgab/route')
    const request = new Request('http://localhost/api/chamgab', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        property_id: VALID_UUID,
        force: true,
      }),
    })

    const response = await POST(request as unknown as NextRequest)
    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toMatchObject({
      error: 'insufficient_credits',
      code: 'insufficient_credits',
    })
  })

  it('POST /api/commercial/predict returns insufficient_credits on quota fail', async () => {
    setupCreditFailureMock()

    vi.doMock('@/app/api/_auth', () => ({
      requireApiUser: vi.fn(async () => ({
        userId: 'user-1',
        email: 'user@test.local',
      })),
    }))

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () => ({})),
    }))

    vi.doMock('@/app/api/commercial/_helpers', () => ({
      FACTOR_NAME_MAP: {},
      INDUSTRY_NAMES: {},
      compressMlProbability: vi.fn((value: number) => value),
      fetchBusinessStats: vi.fn(async () => []),
      fetchSalesStats: vi.fn(async () => []),
      fetchStoreStats: vi.fn(async () => []),
      fetchDistrictCharAggregated: vi.fn(async () => ({})),
      fullName: vi.fn((name: string, sido: string) => `${sido} ${name}`.trim()),
      getDistrictName: vi.fn(async () => ({ name: 'Gangnam', sido: 'Seoul' })),
      getSupabase: vi.fn(() => ({})),
      latestMonth: vi.fn((rows: unknown[]) => rows),
      num: vi.fn((value: unknown) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
      }),
      numOrNull: vi.fn((value: unknown) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }),
      fallbackPredict: vi.fn(() => ({
        success_probability: 55,
        feature_contributions: [],
      })),
    }))

    const { POST } = await import('@/app/api/commercial/predict/route')
    const request = new NextRequest(
      'http://localhost/api/commercial/predict?district_code=11680&industry_code=Q01',
      { method: 'POST' }
    )

    const response = await POST(request)
    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toMatchObject({
      error: 'insufficient_credits',
      code: 'insufficient_credits',
    })
  })

  it('POST /api/school-analysis/reports returns insufficient_credits on quota fail', async () => {
    setupCreditFailureMock()

    vi.doMock('@/app/api/_auth', () => ({
      requireApiUser: vi.fn(async () => ({
        userId: 'user-1',
        email: 'user@test.local',
      })),
    }))

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () => ({})),
    }))

    const { POST } = await import('@/app/api/school-analysis/reports/route')
    const request = new NextRequest('http://localhost/api/school-analysis/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ district_code: '11680' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toMatchObject({
      error: 'insufficient_credits',
      code: 'insufficient_credits',
    })
  })

  it('GET /api/land/analysis returns insufficient_credits on quota fail', async () => {
    setupCreditFailureMock()

    vi.doMock('@/app/api/_auth', () => ({
      requireApiUser: vi.fn(async () => ({
        userId: 'user-1',
        email: 'user@test.local',
      })),
    }))

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () => ({})),
    }))

    const { GET } = await import('@/app/api/land/analysis/route')
    const request = new NextRequest(
      'http://localhost/api/land/analysis?pnu=1168010100100010000',
      { method: 'GET' }
    )

    const response = await GET(request)
    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toMatchObject({
      error: 'insufficient_credits',
      code: 'insufficient_credits',
    })
  })
})
