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

async function callMlApi(params: {
  districtCode: string
  industryCode: string
  overrides?: Record<string, number>
}): Promise<MlPredictResponse | null> {
  if (!ML_API_URL) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

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
        if (Number.isFinite(v) && v !== 0) qs.set(k, String(v))
      }
    }

    // NOTE: ML API의 상권 예측 엔드포인트는 /api/commercial/predict 입니다.
    const res = await fetch(`${ML_API_URL}/api/commercial/predict?${qs}`, {
      method: 'POST',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>

    if (
      typeof data?.success_probability !== 'number' ||
      typeof data?.confidence !== 'number' ||
      !Array.isArray(data?.factors)
    ) {
      return null
    }

    return {
      success_probability: data.success_probability,
      confidence: data.confidence,
      factors: data.factors,
      recommendation: String(data.recommendation || ''),
    }
  } catch {
    return null
  }
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

    let industryName = INDUSTRY_NAMES[industryCode] || industryCode
    let survivalRate: number | null = null
    let monthlyAvgSales: number | null = null
    let salesGrowthRate: number | null = null
    let storeCount: number | null = null
    let franchiseRatio: number | null = null

    if (biz.length > 0) {
      industryName = (biz[0].industry_name as string) || industryCode
      survivalRate = num(biz[0].survival_rate) || null
    }
    if (sales.length > 0) {
      monthlyAvgSales = num(sales[0].monthly_avg_sales) || null
      salesGrowthRate = num(sales[0].sales_growth_rate) || null
    }
    if (stores.length > 0) {
      storeCount = num(stores[0].store_count) || null
      const fc = num(stores[0].franchise_count)
      const sc = num(stores[0].store_count, 1)
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

    const mlResult = await callMlApi({
      districtCode,
      industryCode,
      overrides: feat,
    })

    const ruleConfidence = calcRuleBasedConfidence({
      bizRows: biz,
      salesRows: sales,
      storeRows: stores,
      hasSurvival: survivalRate != null,
      hasSales: monthlyAvgSales != null,
      hasGrowth: salesGrowthRate != null,
      hasStoreCount: storeCount != null,
      hasFranchise: franchiseRatio != null,
    })

    if (mlResult) {
      return NextResponse.json({
        success_probability: mlResult.success_probability,
        confidence: mlResult.confidence,
        factors: mlResult.factors,
        recommendation: mlResult.recommendation,
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
    })
  } catch (err) {
    console.error('[Commercial Predict] Exception:', err)
    return NextResponse.json({ detail: 'Failed to predict' }, { status: 500 })
  }
}
