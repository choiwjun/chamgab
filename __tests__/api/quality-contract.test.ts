import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

function recentIso(hoursAgo = 1): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
}

function makeMetric(value: number) {
  return {
    value,
    unit: 'score',
    provenance: 'official',
    availability: {
      available: true,
      reason: 'available',
    },
    updated_at: recentIso(1),
  }
}

describe('4-menu API quality contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    process.env.FREE_OPEN_MODE = 'true'
    process.env.NEXT_PUBLIC_FREE_OPEN_MODE = 'true'
    process.env.ML_API_URL = ''
    process.env.NEXT_PUBLIC_ML_API_URL = ''
  })

  it('POST /api/chamgab returns required quality fields', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () => ({
        auth: {
          getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        },
      })),
    }))

    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
          if (table === 'chamgab_analyses') {
            const analysis = {
              id: 'analysis-1',
              property_id: VALID_UUID,
              chamgab_price: 1000000000,
              min_price: 900000000,
              max_price: 1100000000,
              confidence: 81,
              analyzed_at: recentIso(2),
              expires_at: recentIso(-24),
              created_at: recentIso(2),
            }
            const chain: any = {
              select: vi.fn(() => chain),
              eq: vi.fn(() => chain),
              gt: vi.fn(() => chain),
              order: vi.fn(() => chain),
              limit: vi.fn(() => chain),
              single: vi.fn(async () => ({ data: analysis, error: null })),
            }
            return chain
          }

          const chain: any = {
            insert: vi.fn(async () => ({ data: null, error: null })),
          }
          return chain
        }),
      })),
    }))

    vi.doMock('@/app/api/chamgab/_quality', () => ({
      buildChamgabQuality: vi.fn(async () => ({
        factor_count: 10,
        factor_complete: true,
        gap_band: 'safe',
        calibration_version: 'test',
        quality_flags: [],
        benchmark_price: 1000000000,
        benchmark_transaction_at: recentIso(72),
        abs_gap_pct: 3.2,
        confidence_pct: 81,
      })),
      deriveChamgabQualityMeta: vi.fn(() => ({
        quality_gate_status: 'pass',
        quality_grade: 'A',
        quality_flags: [],
        quality_version: 'contract-test-v1',
        data_freshness: recentIso(2),
      })),
    }))

    const { POST } = await import('@/app/api/chamgab/route')
    const request = new Request('http://localhost/api/chamgab', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ property_id: VALID_UUID }),
    })

    const response = await POST(request as unknown as NextRequest)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      quality_gate_status: expect.any(String),
      quality_grade: expect.any(String),
      quality_flags: expect.any(Array),
      quality_version: expect.any(String),
    })
    expect(body.data_freshness === null || typeof body.data_freshness === 'string').toBe(true)
  })

  it('POST /api/commercial/predict returns required quality fields', async () => {
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
      INDUSTRY_NAMES: { Q01: 'Cafe' },
      compressMlProbability: vi.fn((value: number) => value),
      fetchBusinessStats: vi.fn(async () => [
        {
          base_year_month: '202601',
          industry_name: 'Cafe',
          survival_rate: 58,
          operating_count: 10,
        },
      ]),
      fetchSalesStats: vi.fn(async () => [
        {
          base_year_month: '202601',
          monthly_avg_sales: 22000000,
          sales_growth_rate: 2.4,
          monthly_sales_count: 10,
        },
      ]),
      fetchStoreStats: vi.fn(async () => [
        {
          base_year_month: '202601',
          store_count: 52,
          franchise_count: 8,
        },
      ]),
      fetchDistrictCharAggregated: vi.fn(async () => ({
        district_type: 'residential',
        resident_ratio: 55,
        office_worker_ratio: 20,
        student_ratio: 11,
        weekend_sales_ratio: 42,
      })),
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
        success_probability: 63,
        feature_contributions: [
          { name: 'survival_rate', importance: 0.45, direction: 'positive' },
        ],
      })),
    }))

    const { POST } = await import('@/app/api/commercial/predict/route')
    const request = new NextRequest(
      'http://localhost/api/commercial/predict?district_code=11680&industry_code=Q01',
      { method: 'POST' }
    )

    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      quality_gate_status: expect.any(String),
      quality_grade: expect.any(String),
      quality_flags: expect.any(Array),
      quality_version: expect.any(String),
      data_freshness: expect.any(Object),
    })
  })

  it('POST /api/school-analysis/reports returns required quality fields', async () => {
    vi.doMock('@/app/api/_auth', () => ({
      requireApiUser: vi.fn(async () => ({
        userId: 'user-1',
        email: 'user@test.local',
      })),
    }))

    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn(async () => ({})),
    }))

    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
          if (table !== 'school_analysis_reports') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            }
          }

          const report = {
            id: 'school-report-1',
            district_code: '11680',
            district_name: 'District 11680',
            generated_at: recentIso(2),
            data_freshness: recentIso(4),
            confidence_score: 88,
            confidence_breakdown: {
              official_confidence: 96,
              inferred_confidence: 4,
              total_confidence: 88,
              formula_version: 'v2.0.0',
            },
            overall_score: makeMetric(82),
            school_quality: {
              overall: makeMetric(83),
              achievement: makeMetric(82),
              progression_outcome: makeMetric(81),
              education_environment: makeMetric(84),
              safety_life: makeMetric(86),
              programs: makeMetric(80),
            },
            progression: {
              general_highschool_rate: makeMetric(58),
              special_purpose_highschool_rate: makeMetric(12),
              autonomy_highschool_rate: makeMetric(10),
              college_progression_rate: makeMetric(66),
            },
            academy_ecosystem: {
              overall: makeMetric(78),
              density: makeMetric(76),
              subject_diversity: makeMetric(75),
              accessibility: makeMetric(79),
              fee_affordability: makeMetric(70),
            },
            commute_safety: makeMetric(80),
            schools: [
              {
                school_id: 's-1',
                school_name: 'Sample School',
                school_level: 'elementary',
                overall_score: makeMetric(82),
                data_status: 'official',
              },
            ],
            data_quality: {
              total_schools: 1,
              official_count: 1,
              name_mismatch_count: 0,
              inactive_count: 0,
              coverage_rate: 96,
            },
          }

          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: 'row-1',
                      report_payload: report,
                      data_freshness: report.data_freshness,
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          }
        }),
      })),
    }))

    const { POST } = await import('@/app/api/school-analysis/reports/route')
    const request = new NextRequest('http://localhost/api/school-analysis/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ district_code: '11680' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      quality_gate_status: expect.any(String),
      quality_grade: expect.any(String),
      quality_flags: expect.any(Array),
      quality_version: expect.any(String),
    })
    expect(body.data_freshness === null || typeof body.data_freshness === 'string').toBe(true)
  })

  it('GET /api/land/analysis returns required quality fields', async () => {
    const parcel = {
      id: 'parcel-1',
      pnu: '1168010100100010000',
      sido: '서울특별시',
      sigungu: '강남구',
      eupmyeondong: '역삼동',
      jibun: '1-1',
      land_category: '대',
      zoning: null,
      area_m2: 120.5,
      location: null,
      latest_official_price_per_m2: 5000000,
      latest_official_price_year: 2025,
      latest_transaction_price: 620000000,
      latest_transaction_date: recentIso(72),
      latest_price_per_m2: 5200000,
      created_at: recentIso(100),
      updated_at: recentIso(2),
    }

    const transactions = [
      {
        id: 'tx-1',
        parcel_id: 'parcel-1',
        pnu: parcel.pnu,
        sido: parcel.sido,
        sigungu: parcel.sigungu,
        eupmyeondong: parcel.eupmyeondong,
        jibun: parcel.jibun,
        land_category: '대',
        transaction_date: recentIso(24 * 20),
        price: 600000000,
        area_m2: 120.5,
        price_per_m2: 5000000,
        is_cancelled: false,
        source_file: 'sample.csv',
        created_at: recentIso(24 * 19),
      },
      {
        id: 'tx-2',
        parcel_id: 'parcel-2',
        pnu: '1168010100100020000',
        sido: parcel.sido,
        sigungu: parcel.sigungu,
        eupmyeondong: parcel.eupmyeondong,
        jibun: '1-2',
        land_category: '대',
        transaction_date: recentIso(24 * 60),
        price: 610000000,
        area_m2: 121,
        price_per_m2: 5040000,
        is_cancelled: false,
        source_file: 'sample.csv',
        created_at: recentIso(24 * 59),
      },
    ]

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
          const rows = table === 'land_parcels' ? [parcel] : transactions
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            neq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            not: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            range: vi.fn(() => chain),
            single: vi.fn(async () => ({
              data: rows[0] ?? null,
              error: rows[0] ? null : { message: 'not found' },
            })),
            maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
            then: (resolve: any, reject: any) =>
              Promise.resolve({ data: rows, error: null }).then(resolve, reject),
          }
          return chain
        }),
      })),
    }))

    vi.doMock('@/lib/land/analysis', () => ({
      buildLandAnalysisSummary: vi.fn(() => ({
        overall_score: 78,
        investment_grade: 'strong',
        price_position_pct: 99,
        local_median_price_per_m2: 5030000,
        local_avg_price_per_m2: 5020000,
        liquidity_12m: 12,
        momentum_6m_pct: 1.5,
        volatility_pct: 4.2,
        sample_size: 2,
        nearby_sample_size: 1,
        signals: ['sample'],
      })),
    }))

    const { GET } = await import('@/app/api/land/analysis/route')
    const request = new NextRequest(
      `http://localhost/api/land/analysis?pnu=${parcel.pnu}`,
      { method: 'GET' }
    )

    const response = await GET(request)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toMatchObject({
      quality_gate_status: expect.any(String),
      quality_grade: expect.any(String),
      quality_flags: expect.any(Array),
      quality_version: expect.any(String),
    })
    expect(body.data_freshness === null || typeof body.data_freshness === 'string').toBe(true)
  })
})
