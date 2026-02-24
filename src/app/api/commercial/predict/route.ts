export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/app/api/_auth'
import {
  FACTOR_NAME_MAP,
  INDUSTRY_NAMES,
  compressMlProbability,
  fetchBusinessStats,
  fetchDistrictCharAggregated,
  fetchSalesStats,
  fetchStoreStats,
  fullName,
  getDistrictName,
  getSupabase,
  latestMonth,
  num,
  numOrNull,
  fallbackPredict,
} from '../_helpers'

const ML_API_URL =
  process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL || ''
const COMMERCIAL_CALIBRATION_VERSION =
  process.env.COMMERCIAL_CALIBRATION_VERSION || 'commercial-cal-v3'
const COMMERCIAL_QUALITY_VERSION =
  process.env.COMMERCIAL_QUALITY_VERSION || 'commercial-quality-v1'

type MlFactor = { name: string; impact: number; direction: string }
interface MlPredictResponse {
  success_probability: number
  raw_success_probability?: number
  confidence: number
  factors: MlFactor[]
}

interface ConfidenceBreakdown {
  coverage: number
  recency: number
  model: number
  calibration_penalty: number
  policy_penalty: number
  industry_fit_adjustment?: number
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

type QualityGateStatus = 'pass' | 'warn' | 'fail'
type QualityGrade = 'A' | 'B' | 'C' | 'D'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function monthsSince(yyyymm: string): number | null {
  if (!/^\d{6}$/.test(yyyymm)) return null
  const year = Number(yyyymm.slice(0, 4))
  const month = Number(yyyymm.slice(4, 6))
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return null
  }
  const now = new Date()
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
}

function weightedMean(
  rows: Record<string, unknown>[],
  field: string,
  weightField: string
): number | null {
  let weightedSum = 0
  let weightSum = 0
  let seen = 0

  for (const row of rows) {
    const value = Number(row[field])
    if (!Number.isFinite(value)) continue
    const rawWeight = Number(row[weightField])
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1
    weightedSum += value * weight
    weightSum += weight
    seen += 1
  }

  if (seen === 0) return null
  return weightSum > 0 ? weightedSum / weightSum : null
}

function resolveIndustryCluster(industryCode: string): string {
  if (industryCode === 'L05') return 'funeral'
  if (industryCode === 'L06') return 'fuel'
  if (['L01', 'L02', 'L03'].includes(industryCode)) return 'healthcare'
  if (industryCode === 'L04') return 'childcare'
  if (industryCode.startsWith('Q')) return 'food'
  if (
    industryCode.startsWith('D') ||
    industryCode.startsWith('R') ||
    industryCode.startsWith('N')
  ) {
    return 'retail'
  }
  if (industryCode === 'S01') return 'academy'
  if (industryCode === 'S02') return 'fitness'
  if (industryCode.startsWith('I') || industryCode.startsWith('S'))
    return 'service'
  return 'other'
}

interface IndustryFitAdjustment {
  probability_adjustment: number
  policy_penalty: number
  reason: string
}

function calcIndustryFitAdjustment(args: {
  industryCode: string
  districtType: string
  residentRatio: number | null
  officeWorkerRatio: number | null
  studentRatio: number | null
  weekendSalesRatio: number | null
}): IndustryFitAdjustment {
  const cluster = resolveIndustryCluster(args.industryCode)
  const districtType = args.districtType.toLowerCase()
  const resident = args.residentRatio ?? 0
  const office = args.officeWorkerRatio ?? 0
  const student = args.studentRatio ?? 0
  const weekend = args.weekendSalesRatio ?? 0

  let adjustment = 0
  const reasons: string[] = []

  if (cluster === 'funeral') {
    if (resident >= 55) {
      adjustment -= 10
      reasons.push('주거 비중 높음')
    }
    if (office <= 25) {
      adjustment -= 2.5
      reasons.push('오피스 주간 수요 낮음')
    }
    if (
      districtType.includes('residential') ||
      districtType.includes('주거') ||
      districtType.includes('아파트')
    ) {
      adjustment -= 5.5
      reasons.push('주거지역 민원/입지 제약')
    }
  } else if (cluster === 'fuel') {
    if (resident >= 60) {
      adjustment -= 5
      reasons.push('주거 밀집 지역')
    }
    if (office >= 40) adjustment += 1
  } else if (cluster === 'healthcare') {
    if (resident >= 40) adjustment += 3
    if (student >= 15) adjustment += 1
  } else if (cluster === 'childcare') {
    if (resident >= 50) adjustment += 4
    if (student >= 12) adjustment += 1.5
    if (office >= 55 && resident < 30) adjustment -= 3
  } else if (cluster === 'food') {
    if (resident >= 35) adjustment += 2
    if (office >= 30) adjustment += 1.5
    if (weekend >= 45) adjustment += 1.5
    if (resident < 20 && office < 20) adjustment -= 3
  } else if (cluster === 'retail') {
    if (resident >= 45) adjustment += 2.5
    if (student >= 15) adjustment += 1
    if (weekend >= 50) adjustment += 1.5
    if (office >= 55 && resident < 25) adjustment -= 2
  } else if (cluster === 'academy') {
    if (resident >= 45) adjustment += 2.5
    if (student >= 18) adjustment += 3
    if (office >= 55 && student < 10) adjustment -= 2.5
  } else if (cluster === 'fitness') {
    if (office >= 35) adjustment += 2
    if (resident >= 35) adjustment += 2
    if (weekend >= 45) adjustment += 1
  } else if (cluster === 'service') {
    if (office >= 30) adjustment += 1.5
    if (resident >= 35) adjustment += 1.5
    if (resident < 20 && office < 20) adjustment -= 2
  } else if (resident >= 40 || office >= 35) {
    adjustment += 1
  }

  const normalized = round1(clamp(adjustment, -24, 10))
  const policyPenalty = round1(Math.min(12, Math.max(0, -normalized) * 0.65))
  const reason = reasons.join(', ')
  return {
    probability_adjustment: normalized,
    policy_penalty: policyPenalty,
    reason,
  }
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
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const query = new URLSearchParams({
        district_code: params.districtCode,
        industry_code: params.industryCode,
      })

      if (params.overrides) {
        const allow = [
          'survival_rate',
          'monthly_avg_sales',
          'sales_growth_rate',
          'store_count',
          'franchise_ratio',
          'competition_ratio',
        ] as const
        for (const key of allow) {
          const value = Number(params.overrides[key])
          if (Number.isFinite(value)) query.set(key, String(value))
        }
      }

      const response = await fetch(
        `${ML_API_URL}/api/commercial/predict?${query}`,
        {
          method: 'POST',
          signal: controller.signal,
          cache: 'no-store',
        }
      )
      clearTimeout(timer)

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        let detail = ''
        try {
          const parsed = text ? JSON.parse(text) : null
          detail = String(
            (parsed && (parsed.detail || parsed.error || parsed.message)) || ''
          )
        } catch {
          detail = text
        }
        detail = detail.trim().slice(0, 220)

        return {
          ok: false,
          reason: response.status === 404 ? 'incompatible' : 'http_error',
          status: response.status,
          detail: detail || undefined,
        }
      }

      const data = (await response.json()) as Record<string, unknown>
      if (
        typeof data.success_probability !== 'number' ||
        typeof data.confidence !== 'number' ||
        !Array.isArray(data.factors)
      ) {
        return { ok: false, reason: 'invalid_shape' }
      }

      return {
        ok: true,
        data: {
          success_probability: data.success_probability,
          raw_success_probability:
            typeof data.raw_success_probability === 'number'
              ? data.raw_success_probability
              : undefined,
          confidence: data.confidence,
          factors: data.factors as MlFactor[],
        },
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { ok: false, reason: 'timeout' }
      }
      return { ok: false, reason: 'exception' }
    }
  }

  const first = await attempt(12_000)
  if (first.ok) return first
  if (first.reason === 'timeout') return attempt(12_000)
  return first
}

function calcCoverageComponent(args: {
  hasBiz: boolean
  hasSalesRows: boolean
  hasStoreRows: boolean
  hasSurvival: boolean
  hasSales: boolean
  hasGrowth: boolean
  hasStoreCount: boolean
  hasFranchise: boolean
}): number {
  let score = 0
  if (args.hasBiz) score += 20
  if (args.hasSalesRows) score += 20
  if (args.hasStoreRows) score += 20

  if (args.hasSurvival) score += 8
  if (args.hasSales) score += 8
  if (args.hasGrowth) score += 8
  if (args.hasStoreCount) score += 8
  if (args.hasFranchise) score += 8

  return round1(clamp(score, 0, 100))
}

function recencyScoreFromRows(rows: Record<string, unknown>[]): number {
  if (rows.length === 0) return 35
  const monthGap = monthsSince(String(rows[0]?.base_year_month || ''))
  if (monthGap == null) return 45
  if (monthGap <= 1) return 100
  if (monthGap <= 3) return 96
  if (monthGap <= 6) return 88
  if (monthGap <= 12) return 72
  return 45
}

function calcRecencyComponent(args: {
  bizRows: Record<string, unknown>[]
  salesRows: Record<string, unknown>[]
  storeRows: Record<string, unknown>[]
}): number {
  const values = [
    recencyScoreFromRows(args.bizRows),
    recencyScoreFromRows(args.salesRows),
    recencyScoreFromRows(args.storeRows),
  ]
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function calcRuleBasedConfidence(args: {
  hasBiz: boolean
  hasSalesRows: boolean
  hasStoreRows: boolean
  hasSurvival: boolean
  hasSales: boolean
  hasGrowth: boolean
  hasStoreCount: boolean
  hasFranchise: boolean
  bizRows: Record<string, unknown>[]
  salesRows: Record<string, unknown>[]
  storeRows: Record<string, unknown>[]
}): number {
  let score = 45
  if (args.hasBiz) score += 15
  if (args.hasSalesRows) score += 15
  if (args.hasStoreRows) score += 15
  if (args.hasSurvival) score += 2
  if (args.hasSales) score += 2
  if (args.hasGrowth) score += 2
  if (args.hasStoreCount) score += 2
  if (args.hasFranchise) score += 2

  const recencyBonus = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return 0
    const monthGap = monthsSince(String(rows[0]?.base_year_month || ''))
    if (monthGap == null) return 0
    if (monthGap <= 3) return 4
    if (monthGap <= 6) return 2
    return 0
  }
  score +=
    recencyBonus(args.bizRows) +
    recencyBonus(args.salesRows) +
    recencyBonus(args.storeRows)

  const fullCoverage = args.hasBiz && args.hasSalesRows && args.hasStoreRows
  return round1(clamp(score, 30, fullCoverage ? 90 : 82))
}

function calcCalibrationPenalty(
  rawProbability: number,
  calibratedProbability: number
): number {
  return round1(
    Math.min(18, Math.abs(rawProbability - calibratedProbability) * 0.8)
  )
}

function buildRecommendation(args: {
  probability: number
  districtName: string
  industryName: string
  fitReason: string
}): string {
  if (args.probability >= 75) {
    return `${args.districtName} / ${args.industryName}은(는) 진입 우선 검토가 가능합니다.`
  }
  if (args.probability >= 60) {
    return `${args.districtName} / ${args.industryName}은(는) 조건부 진입 검토가 필요합니다.`
  }
  if (args.fitReason) {
    return `${args.districtName} / ${args.industryName}은(는) 현재 조건에서 리스크가 높습니다. 주요 근거: ${args.fitReason}.`
  }
  return `${args.districtName} / ${args.industryName}은(는) 현재 조건에서 진입 리스크가 높습니다.`
}

function buildQualityFlags(args: {
  hasBiz: boolean
  hasSalesRows: boolean
  hasStoreRows: boolean
  staleMonths: {
    biz: number | null
    sales: number | null
    store: number | null
  }
  confidence: number
  policyPenalty: number
  mlSource: 'ml_model' | 'rule_based'
}): string[] {
  const flags: string[] = []
  if (!args.hasBiz) flags.push('missing_business_data')
  if (!args.hasSalesRows) flags.push('missing_sales_data')
  if (!args.hasStoreRows) flags.push('missing_store_data')
  if (
    (args.staleMonths.biz ?? 0) > 3 ||
    (args.staleMonths.sales ?? 0) > 3 ||
    (args.staleMonths.store ?? 0) > 3
  ) {
    flags.push('stale_data')
  }
  if (args.policyPenalty >= 5) flags.push('industry_location_mismatch')
  if (args.mlSource === 'rule_based') flags.push('fallback_rule_based')
  if (args.confidence < 72) flags.push('low_confidence')
  return flags
}

function classifyCommercialQuality(
  qualityFlags: string[],
  confidence: number
): { quality_gate_status: QualityGateStatus; quality_grade: QualityGrade } {
  const failFlags = new Set([
    'missing_business_data',
    'missing_sales_data',
    'missing_store_data',
  ])
  const hasFail = qualityFlags.some((flag) => failFlags.has(flag))
  if (hasFail) {
    return { quality_gate_status: 'fail', quality_grade: 'D' }
  }

  const hasWarn = qualityFlags.length > 0 || confidence < 72
  if (hasWarn) {
    return { quality_gate_status: 'warn', quality_grade: 'C' }
  }

  return {
    quality_gate_status: 'pass',
    quality_grade: confidence >= 85 ? 'A' : 'B',
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser()
  if ('response' in auth) return auth.response

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

    const [biz, sales, stores, districtChar] = await Promise.all([
      fetchBusinessStats(supabase, districtCode, industryCode),
      fetchSalesStats(supabase, districtCode, industryCode),
      fetchStoreStats(supabase, districtCode, industryCode),
      fetchDistrictCharAggregated(supabase, districtCode),
    ])

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
      industryName = (bizLatest[0].industry_name as string) || industryName
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
      const totalStores = storesLatest.reduce(
        (sum, row) => sum + (Number(row.store_count) || 0),
        0
      )
      const totalFranchise = storesLatest.reduce(
        (sum, row) => sum + (Number(row.franchise_count) || 0),
        0
      )
      storeCount =
        totalStores > 0 ? totalStores : num(storesLatest[0].store_count) || null
      franchiseRatio = totalStores > 0 ? totalFranchise / totalStores : null
    }

    const features = {
      survival_rate:
        numOrNull(params.get('survival_rate')) ?? survivalRate ?? 50.0,
      monthly_avg_sales:
        numOrNull(params.get('monthly_avg_sales')) ??
        monthlyAvgSales ??
        20_000_000,
      sales_growth_rate:
        numOrNull(params.get('sales_growth_rate')) ?? salesGrowthRate ?? 0.0,
      store_count: numOrNull(params.get('store_count')) ?? storeCount ?? 80,
      franchise_ratio:
        numOrNull(params.get('franchise_ratio')) ?? franchiseRatio ?? 0.15,
      competition_ratio: numOrNull(params.get('competition_ratio')) ?? 1.0,
    }

    const hasBiz = bizLatest.length > 0
    const hasSalesRows = salesLatest.length > 0
    const hasStoreRows = storesLatest.length > 0
    const hasSurvival = survivalRate != null
    const hasSales = monthlyAvgSales != null
    const hasGrowth = salesGrowthRate != null
    const hasStoreCount = storeCount != null
    const hasFranchise = franchiseRatio != null
    const hasFullCoverage = hasBiz && hasSalesRows && hasStoreRows

    const coverageComponent = calcCoverageComponent({
      hasBiz,
      hasSalesRows,
      hasStoreRows,
      hasSurvival,
      hasSales,
      hasGrowth,
      hasStoreCount,
      hasFranchise,
    })
    const recencyComponent = calcRecencyComponent({
      bizRows: bizLatest,
      salesRows: salesLatest,
      storeRows: storesLatest,
    })
    const ruleConfidence = calcRuleBasedConfidence({
      hasBiz,
      hasSalesRows,
      hasStoreRows,
      hasSurvival,
      hasSales,
      hasGrowth,
      hasStoreCount,
      hasFranchise,
      bizRows: bizLatest,
      salesRows: salesLatest,
      storeRows: storesLatest,
    })

    const districtType = String(districtChar.district_type || '')
    const industryFit = calcIndustryFitAdjustment({
      industryCode,
      districtType,
      residentRatio: numOrNull(districtChar.resident_ratio),
      officeWorkerRatio: numOrNull(districtChar.office_worker_ratio),
      studentRatio: numOrNull(districtChar.student_ratio),
      weekendSalesRatio: numOrNull(districtChar.weekend_sales_ratio),
    })

    const mlCall = await callMlApi({
      districtCode,
      industryCode,
      overrides: features,
    })

    const baseYearMonth = {
      business:
        bizLatest.length > 0
          ? String(bizLatest[0].base_year_month || '')
          : null,
      sales:
        salesLatest.length > 0
          ? String(salesLatest[0].base_year_month || '')
          : null,
      store:
        storesLatest.length > 0
          ? String(storesLatest[0].base_year_month || '')
          : null,
    }
    const staleMonths = {
      biz: monthsSince(baseYearMonth.business || ''),
      sales: monthsSince(baseYearMonth.sales || ''),
      store: monthsSince(baseYearMonth.store || ''),
    }

    if (mlCall.ok) {
      const mlProbability = round1(
        clamp(Number(mlCall.data.success_probability) || 0, 0, 100)
      )
      const hasRaw =
        typeof mlCall.data.raw_success_probability === 'number' &&
        Number.isFinite(mlCall.data.raw_success_probability)

      const rawProbability = hasRaw
        ? round1(clamp(mlCall.data.raw_success_probability as number, 0, 100))
        : mlProbability
      const calibratedProbability = hasRaw
        ? mlProbability
        : compressMlProbability(mlProbability)
      const finalProbability = round1(
        clamp(
          calibratedProbability + industryFit.probability_adjustment,
          0,
          100
        )
      )

      const modelConfidence = round1(clamp(mlCall.data.confidence, 0, 100))
      const p = finalProbability / 100
      const decisiveness = 1 - 4 * p * (1 - p)
      const decisivenessScore = 40 + decisiveness * 45
      const calibrationPenalty = calcCalibrationPenalty(
        rawProbability,
        calibratedProbability
      )
      const confidence = round1(
        clamp(
          0.6 * ruleConfidence +
            0.35 * modelConfidence +
            0.05 * decisivenessScore -
            calibrationPenalty -
            industryFit.policy_penalty,
          30,
          hasFullCoverage ? 90 : 82
        )
      )

      const factors = [...mlCall.data.factors].map((factor) => ({
        name: FACTOR_NAME_MAP[factor.name] || factor.name,
        impact: factor.impact,
        direction: factor.direction,
      }))
      if (industryFit.probability_adjustment !== 0) {
        factors.push({
          name: '업종-상권 적합도',
          impact: Math.abs(industryFit.probability_adjustment),
          direction:
            industryFit.probability_adjustment > 0 ? 'positive' : 'negative',
        })
      }

      const confidenceBreakdown: ConfidenceBreakdown = {
        coverage: coverageComponent,
        recency: recencyComponent,
        model: modelConfidence,
        calibration_penalty: calibrationPenalty,
        policy_penalty: industryFit.policy_penalty,
        industry_fit_adjustment: industryFit.probability_adjustment,
      }

      const recommendation = buildRecommendation({
        probability: finalProbability,
        districtName,
        industryName,
        fitReason: industryFit.reason,
      })

      const qualityFlags = buildQualityFlags({
        hasBiz,
        hasSalesRows,
        hasStoreRows,
        staleMonths,
        confidence,
        policyPenalty: industryFit.policy_penalty,
        mlSource: 'ml_model',
      })
      const qualityMeta = classifyCommercialQuality(qualityFlags, confidence)

      return NextResponse.json({
        success_probability: finalProbability,
        raw_success_probability: hasRaw ? rawProbability : undefined,
        confidence,
        model_confidence: modelConfidence,
        confidence_breakdown: confidenceBreakdown,
        calibration_version: COMMERCIAL_CALIBRATION_VERSION,
        quality_gate_status: qualityMeta.quality_gate_status,
        quality_grade: qualityMeta.quality_grade,
        quality_flags: qualityFlags,
        quality_version: COMMERCIAL_QUALITY_VERSION,
        data_freshness: baseYearMonth,
        factors,
        recommendation,
        source: 'ml_model',
        data_coverage: {
          business_rows: bizLatest.length,
          sales_rows: salesLatest.length,
          store_rows: storesLatest.length,
        },
      })
    }

    const fallback = fallbackPredict(features)
    const calibratedProbability = compressMlProbability(
      fallback.success_probability
    )
    const finalProbability = round1(
      clamp(calibratedProbability + industryFit.probability_adjustment, 0, 100)
    )
    const confidence = round1(
      clamp(
        ruleConfidence - industryFit.policy_penalty,
        30,
        hasFullCoverage ? 90 : 82
      )
    )

    const factors = fallback.feature_contributions.map((factor) => ({
      name: FACTOR_NAME_MAP[factor.name] || factor.name,
      impact: factor.importance,
      direction: factor.direction,
    }))
    if (industryFit.probability_adjustment !== 0) {
      factors.push({
        name: '업종-상권 적합도',
        impact: Math.abs(industryFit.probability_adjustment),
        direction:
          industryFit.probability_adjustment > 0 ? 'positive' : 'negative',
      })
    }
    factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

    const recommendation = buildRecommendation({
      probability: finalProbability,
      districtName,
      industryName,
      fitReason: industryFit.reason,
    })

    const confidenceBreakdown: ConfidenceBreakdown = {
      coverage: coverageComponent,
      recency: recencyComponent,
      model: ruleConfidence,
      calibration_penalty: 0,
      policy_penalty: industryFit.policy_penalty,
      industry_fit_adjustment: industryFit.probability_adjustment,
    }

    const qualityFlags = buildQualityFlags({
      hasBiz,
      hasSalesRows,
      hasStoreRows,
      staleMonths,
      confidence,
      policyPenalty: industryFit.policy_penalty,
      mlSource: 'rule_based',
    })
    const qualityMeta = classifyCommercialQuality(qualityFlags, confidence)

    return NextResponse.json({
      success_probability: finalProbability,
      confidence,
      confidence_breakdown: confidenceBreakdown,
      calibration_version: COMMERCIAL_CALIBRATION_VERSION,
      quality_gate_status: qualityMeta.quality_gate_status,
      quality_grade: qualityMeta.quality_grade,
      quality_flags: qualityFlags,
      quality_version: COMMERCIAL_QUALITY_VERSION,
      data_freshness: baseYearMonth,
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
  } catch (error) {
    console.error('[commercial/predict] exception', error)
    return NextResponse.json({ detail: 'Failed to predict' }, { status: 500 })
  }
}
