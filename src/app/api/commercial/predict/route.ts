/**
 * POST /api/commercial/predict
 *
 * 창업 성공 확률 예측 - ML API 우선, fallback으로 규칙 기반
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

interface MlPredictResponse {
  success_probability: number
  confidence: number
  feature_contributions: Array<{
    name: string
    importance: number
    direction: string
  }>
}

async function callMlApi(
  feat: Record<string, number>
): Promise<MlPredictResponse | null> {
  if (!ML_API_URL) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(`${ML_API_URL}/api/business/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feat),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    return (await res.json()) as MlPredictResponse
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const params = request.nextUrl.searchParams
    const districtCode = params.get('district_code') || ''
    const industryCode = params.get('industry_code') || ''

    if (!districtCode || !industryCode) {
      return NextResponse.json(
        { detail: 'district_code, industry_code 필수' },
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

    // ML API 우선 시도, 실패 시 규칙 기반 fallback
    const mlResult = await callMlApi(feat)
    const result = mlResult || fallbackPredict(feat)

    // 한글 요인명 변환
    const factors = result.feature_contributions.map((c) => ({
      name: FACTOR_NAME_MAP[c.name] || c.name,
      impact: c.importance,
      direction: c.direction,
    }))
    factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

    let recommendation: string
    if (result.success_probability >= 70) {
      recommendation = `${districtName}에서 ${industryName} 창업을 추천합니다. 성공 가능성이 높습니다.`
    } else if (result.success_probability >= 50) {
      recommendation = `${districtName}에서 ${industryName} 창업을 신중히 검토하세요. 추가 분석이 필요합니다.`
    } else {
      recommendation = `${districtName}에서 ${industryName} 창업은 리스크가 높습니다. 다른 지역이나 업종을 고려하세요.`
    }

    return NextResponse.json({
      success_probability: result.success_probability,
      confidence: result.confidence,
      factors,
      recommendation,
      source: mlResult ? 'ml_model' : 'rule_based',
    })
  } catch (err) {
    console.error('[Predict] Exception:', err)
    return NextResponse.json(
      { detail: '예측 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
