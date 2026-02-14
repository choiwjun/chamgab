/**
 * POST /api/commercial/predict
 *
 * 창업 성공 확률 예측
 * - ML API가 설정/가용하면 ML 결과를 사용합니다.
 * - 실패 시 rule-based fallback을 사용하고, 데이터 커버리지/최신성 기반으로 신뢰도를 계산합니다.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getSupabase,
  getDistrictName,
  fullName,
  fetchBusinessStats,
  fetchSalesStats,
  fetchStoreStats,
  latestMonth,
  fallbackPredict,
  FACTOR_NAME_MAP,
  INDUSTRY_NAMES,
  num,
} from '../_helpers'

const ML_API_URL =
  process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL || ''

type MlFactor = { name: string; impact: number; direction: string }

interface MlPredictResponse {
  success_probability: number
  confidence: number
  factors: MlFactor[]
  recommendation: string
}

type MlCallResult =
  | { ok: true; data: MlPredictResponse }
  | {
      ok: false
      reason:
        | 'not_configured'
        | 'timeout'
        | 'http_error'
        | 'incompatible'
        | 'invalid_shape'
        | 'exception'
      status?: number
      detail?: string
    }

async function callMlApi(params: {
  districtCode: string
  industryCode: string
  overrides?: Record<string, number>
}): Promise<MlCallResult> {
  if (!ML_API_URL) return { ok: false, reason: 'not_configured' }

  const attempt = async (timeoutMs: number): Promise<MlCallResult> => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const qs = new URLSearchParams({
        district_code: params.districtCode,
        industry_code: params.industryCode,
      })

      // Optional overrides: ML API can fetch from Supabase by itself.
      const o = params.overrides
      if (o) {
        const allow = [
          'survival_rate',
          'monthly_avg_sales',
          'sales_growth_rate',
          'store_count',
          'franchise_ratio',
          'competition_ratio',
        ] as const
        for (const k of allow) {
          const v = Number((o as Record<string, unknown>)[k])
          // 0 is a valid value; pass it through.
          if (Number.isFinite(v)) qs.set(k, String(v))
        }
      }

      // NOTE: ML API의 상권 예측 엔드포인트는 /api/commercial/predict 입니다.
      const res = await fetch(`${ML_API_URL}/api/commercial/predict?${qs}`, {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let detail = ''
        try {
          const j = text ? JSON.parse(text) : null
          detail = String((j && (j.detail || j.error || j.message)) || '')
        } catch {
          detail = text
        }
        detail = detail.trim().slice(0, 220)
        const incompatible =
          res.status === 404 &&
          (detail.includes('상권을 찾을 수 없습니다') ||
            detail.toLowerCase().includes('not found'))
        return {
          ok: false,
          reason: incompatible ? 'incompatible' : 'http_error',
          status: res.status,
          detail: detail || undefined,
        }
      }
      const data = (await res.json()) as Record<string, unknown>

      if (
        typeof data?.success_probability !== 'number' ||
        typeof data?.confidence !== 'number' ||
        !Array.isArray(data?.factors)
      ) {
        return { ok: false, reason: 'invalid_shape' }
      }

      return {
        ok: true,
        data: {
          success_probability: data.success_probability,
          confidence: data.confidence,
          factors: data.factors,
          recommendation: String(data.recommendation || ''),
        },
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, reason: 'timeout' }
      }
      return { ok: false, reason: 'exception' }
    }
  }

  // HuggingFace Spaces can be cold-started; give it more time and one retry.
  const first = await attempt(12_000)
  if (first.ok) return first
  if (first.reason === 'timeout') return attempt(12_000)
  return first
}

function monthsSince(yyyymm: string): number | null {
  if (!/^\d{6}$/.test(yyyymm)) return null
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4, 6))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth() + 1
  return (ny - y) * 12 + (nm - m)
}

function calcRuleBasedConfidence(args: {
  bizRows: Record<string, unknown>[]
  salesRows: Record<string, unknown>[]
  storeRows: Record<string, unknown>[]
  hasSurvival: boolean
  hasSales: boolean
  hasGrowth: boolean
  hasStoreCount: boolean
  hasFranchise: boolean
}): number {
  const hasBiz = args.bizRows.length > 0
  const hasSalesRows = args.salesRows.length > 0
  const hasStoreRows = args.storeRows.length > 0

  // Baseline for rule-based model.
  let c = 45

  // Coverage weights (max +45).
  if (hasBiz) c += 15
  if (hasSalesRows) c += 15
  if (hasStoreRows) c += 15

  // Feature completeness (max +10).
  if (args.hasSurvival) c += 2
  if (args.hasSales) c += 2
  if (args.hasGrowth) c += 2
  if (args.hasStoreCount) c += 2
  if (args.hasFranchise) c += 2

  // Recency bonus (max +10).
  const bizM = hasBiz
    ? monthsSince(String(args.bizRows[0]?.base_year_month || ''))
    : null
  const salesM = hasSalesRows
    ? monthsSince(String(args.salesRows[0]?.base_year_month || ''))
    : null
  const storeM = hasStoreRows
    ? monthsSince(String(args.storeRows[0]?.base_year_month || ''))
    : null
  const recencyBonus = (mm: number | null) => {
    if (mm == null) return 0
    if (mm <= 6) return 4
    if (mm <= 12) return 2
    return 0
  }
  c += recencyBonus(bizM) + recencyBonus(salesM) + recencyBonus(storeM)

  // Rule-based confidence cap:
  // - Without full data, do not report "very high" confidence.
  const allPresent = hasBiz && hasSalesRows && hasStoreRows
  const cap = allPresent ? 90 : 80
  return Math.round(Math.min(Math.max(c, 30), cap) * 10) / 10
}

function weightedMean(
  rows: Record<string, unknown>[],
  field: string,
  weightField: string
): number | null {
  let wsum = 0
  let vsum = 0
  let seen = 0
  for (const r of rows) {
    const v = Number(r[field])
    if (!Number.isFinite(v)) continue
    const wRaw = Number(r[weightField])
    const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1
    wsum += w
    vsum += w * v
    seen += 1
  }
  if (seen === 0) return null
  return wsum > 0 ? vsum / wsum : null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const params = request.nextUrl.searchParams
    const districtCode = params.get('district_code') || ''
    const industryCode = params.get('industry_code') || ''

    if (!districtCode || !industryCode) {
      return NextResponse.json(
        { detail: 'district_code, industry_code is required' },
        { status: 400 }
      )
    }

    const { name, sido } = await getDistrictName(supabase, districtCode)
    const districtName = fullName(name, sido)

    const biz = await fetchBusinessStats(supabase, districtCode, industryCode)
    const sales = await fetchSalesStats(supabase, districtCode, industryCode)
    const stores = await fetchStoreStats(supabase, districtCode, industryCode)

    const bizLatest = latestMonth(biz)
    const salesLatest = latestMonth(sales)
    const storesLatest = latestMonth(stores)

    let industryName = INDUSTRY_NAMES[industryCode] || industryCode
    let survivalRate: number | null = null
    let monthlyAvgSales: number | null = null
    let salesGrowthRate: number | null = null
    let storeCount: number | null = null
    let franchiseRatio: number | null = null

    if (bizLatest.length > 0) {
      industryName = (bizLatest[0].industry_name as string) || industryCode
      survivalRate =
        weightedMean(bizLatest, 'survival_rate', 'operating_count') ??
        (num(bizLatest[0].survival_rate) || null)
    }
    if (salesLatest.length > 0) {
      monthlyAvgSales =
        weightedMean(salesLatest, 'monthly_avg_sales', 'monthly_sales_count') ??
        (num(salesLatest[0].monthly_avg_sales) || null)
      salesGrowthRate =
        weightedMean(salesLatest, 'sales_growth_rate', 'monthly_avg_sales') ??
        (num(salesLatest[0].sales_growth_rate) || null)
    }
    if (storesLatest.length > 0) {
      const sc = storesLatest.reduce(
        (s, r) =>
          s +
          (Number.isFinite(Number(r.store_count)) ? Number(r.store_count) : 0),
        0
      )
      const fc = storesLatest.reduce(
        (s, r) =>
          s +
          (Number.isFinite(Number(r.franchise_count))
            ? Number(r.franchise_count)
            : 0),
        0
      )
      storeCount = sc > 0 ? sc : num(storesLatest[0].store_count) || null
      franchiseRatio = sc > 0 ? Math.round((fc / sc) * 1000) / 1000 : null
    }

    // 명시적 파라미터 우선
    const feat = {
      survival_rate:
        num(params.get('survival_rate'), 0) || survivalRate || 75.0,
      monthly_avg_sales:
        num(params.get('monthly_avg_sales'), 0) || monthlyAvgSales || 40000000,
      sales_growth_rate:
        num(params.get('sales_growth_rate'), 0) || salesGrowthRate || 3.0,
      store_count: num(params.get('store_count'), 0) || storeCount || 120,
      franchise_ratio:
        num(params.get('franchise_ratio'), 0) || franchiseRatio || 0.3,
      competition_ratio: num(params.get('competition_ratio'), 0) || 1.2,
    }

    const mlCall = await callMlApi({
      districtCode,
      industryCode,
      overrides: feat,
    })

    const ruleConfidence = calcRuleBasedConfidence({
      bizRows: bizLatest,
      salesRows: salesLatest,
      storeRows: storesLatest,
      hasSurvival: survivalRate != null,
      hasSales: monthlyAvgSales != null,
      hasGrowth: salesGrowthRate != null,
      hasStoreCount: storeCount != null,
      hasFranchise: franchiseRatio != null,
    })

    if (mlCall.ok) {
      return NextResponse.json({
        success_probability: mlCall.data.success_probability,
        confidence: mlCall.data.confidence,
        factors: mlCall.data.factors,
        recommendation: mlCall.data.recommendation,
        source: 'ml_model',
      })
    }

    const fb = fallbackPredict(feat)
    const factors = fb.feature_contributions.map((c) => ({
      name: FACTOR_NAME_MAP[c.name] || c.name,
      impact: c.importance,
      direction: c.direction,
    }))
    factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

    const recommendation =
      fb.success_probability >= 70
        ? `${districtName}에서 ${industryName} 창업을 추천합니다. 성공 가능성이 높습니다.`
        : fb.success_probability >= 50
          ? `${districtName}에서 ${industryName} 창업은 신중히 검토하세요. 추가 분석이 필요합니다.`
          : `${districtName}에서 ${industryName} 창업은 리스크가 큽니다. 다른 지역/업종을 고려하세요.`

    return NextResponse.json({
      success_probability: fb.success_probability,
      confidence: ruleConfidence,
      factors,
      recommendation,
      source: 'rule_based',
      ml_status: mlCall.reason,
      ml_http_status:
        mlCall.reason === 'http_error' || mlCall.reason === 'incompatible'
          ? (mlCall.status ?? null)
          : null,
      ml_detail:
        mlCall.reason === 'http_error' || mlCall.reason === 'incompatible'
          ? (mlCall.detail ?? null)
          : null,
      data_coverage: {
        business_rows: bizLatest.length,
        sales_rows: salesLatest.length,
        store_rows: storesLatest.length,
      },
    })
  } catch (err) {
    console.error('[Commercial Predict] Exception:', err)
    return NextResponse.json({ detail: 'Failed to predict' }, { status: 500 })
  }
}
