import type {
  LandParcel,
  LandTransaction,
  LandOfficialPrice,
} from '@/types/land'

export type LandValuationGrade =
  | 'undervalued'
  | 'fair'
  | 'overvalued'
  | 'insufficient'

export interface LandValuationFactor {
  label: string
  impact: 'positive' | 'negative' | 'neutral'
  description: string
}

export interface LandValuationSummary {
  estimated_price_per_m2: number | null
  estimated_total_price: number | null
  lower_bound_price: number | null
  upper_bound_price: number | null
  confidence_score: number
  valuation_grade: LandValuationGrade
  sample_size: number
  volatility_pct: number | null
  factors: LandValuationFactor[]
  model_version: string
  disclaimer: string
}

interface BuildLandValuationInput {
  parcel: LandParcel
  transactions: LandTransaction[]
  nearbyTransactions: LandTransaction[]
  officialPrices: LandOfficialPrice[]
}

interface LandMlPredictRequest {
  pnu: string
  land_category: string
  zoning: string | null
  area_m2: number | null
  latest_price_per_m2: number | null
  local_median_price_per_m2: number | null
  local_mean_price_per_m2: number | null
  official_price_per_m2: number | null
  momentum_6m_pct: number | null
  volatility_pct: number | null
  sample_size: number
}

interface LandMlPredictResponse {
  estimated_price_per_m2: number | null
  estimated_total_price: number | null
  lower_bound_price: number | null
  upper_bound_price: number | null
  confidence_score: number
  valuation_grade: string
  sample_size: number
  volatility_pct: number | null
  factors: Array<{
    label: string
    impact: 'positive' | 'negative' | 'neutral' | string
    description: string
  }>
  model_version: string
  disclaimer: string
}

interface DerivedMetrics {
  localMedian: number | null
  localMean: number | null
  localStd: number | null
  momentumPct: number | null
  sampleSize: number
  officialLatest: LandOfficialPrice | null
}

const LAND_ML_API_URL =
  process.env.ML_API_URL || process.env.NEXT_PUBLIC_ML_API_URL || ''

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function std(values: number[]): number | null {
  const avg = mean(values)
  if (avg == null) return null
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function pickZoningAdjustment(zoning: string | null): number {
  const value = (zoning || '').toLowerCase()
  if (value.includes('상업')) return 0.08
  if (value.includes('준주거')) return 0.04
  if (value.includes('공업')) return 0.02
  if (value.includes('녹지')) return -0.08
  if (value.includes('주거')) return 0
  return 0
}

function pickLandCategoryAdjustment(landCategory: string): number {
  if (landCategory === '대') return 0.03
  if (landCategory === '임') return -0.05
  if (landCategory === '잡') return -0.01
  return 0
}

function calcMomentum(localRows: { price: number; ts: number }[]): number | null {
  if (localRows.length < 4) return null

  const now = Date.now()
  const recentCutoff = now - 180 * 24 * 60 * 60 * 1000
  const previousCutoff = now - 360 * 24 * 60 * 60 * 1000

  const recent = localRows
    .filter((row) => row.ts >= recentCutoff)
    .map((row) => row.price)
  const previous = localRows
    .filter((row) => row.ts < recentCutoff && row.ts >= previousCutoff)
    .map((row) => row.price)

  const recentAvg = mean(recent)
  const previousAvg = mean(previous)
  if (recentAvg == null || previousAvg == null || previousAvg <= 0) return null

  return ((recentAvg - previousAvg) / previousAvg) * 100
}

function buildDerivedMetrics(input: BuildLandValuationInput): DerivedMetrics {
  const pricedRows = [...input.transactions, ...input.nearbyTransactions]
    .map((tx) => {
      const price = Number(tx.price_per_m2)
      const ts = Date.parse(tx.transaction_date)
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) {
        return null
      }
      return { price, ts }
    })
    .filter((row): row is { price: number; ts: number } => row != null)

  const localPrices = pricedRows.map((row) => row.price)

  return {
    localMedian: median(localPrices),
    localMean: mean(localPrices),
    localStd: std(localPrices),
    momentumPct: calcMomentum(pricedRows),
    sampleSize: localPrices.length,
    officialLatest: input.officialPrices[0] || null,
  }
}

function buildFallbackSummary(
  input: BuildLandValuationInput,
  derived: DerivedMetrics
): LandValuationSummary {
  const { localMedian, localMean, localStd, momentumPct, sampleSize, officialLatest } =
    derived

  const marketBased = localMedian
  const officialBased = officialLatest
    ? Number(officialLatest.official_price_per_m2) * 1.08
    : null

  let baseEstimate: number | null = null
  if (marketBased != null && officialBased != null) {
    baseEstimate = marketBased * 0.75 + officialBased * 0.25
  } else if (marketBased != null) {
    baseEstimate = marketBased
  } else if (officialBased != null) {
    baseEstimate = officialBased
  }

  const zoningAdj = pickZoningAdjustment(input.parcel.zoning)
  const categoryAdj = pickLandCategoryAdjustment(input.parcel.land_category)
  const momentumAdj =
    momentumPct != null ? clamp(momentumPct * 0.0035, -0.08, 0.08) : 0
  const totalAdjustment = zoningAdj + categoryAdj + momentumAdj

  const adjustedEstimate =
    baseEstimate != null ? Math.round(baseEstimate * (1 + totalAdjustment)) : null

  const area = Number(input.parcel.area_m2 || 0)
  const estimatedTotal =
    adjustedEstimate != null && area > 0
      ? Math.round((adjustedEstimate * area) / 10000)
      : null

  const volatilityPct =
    localStd != null && localMean != null && localMean > 0
      ? (localStd / localMean) * 100
      : null

  const rangeBandPct = clamp(
    25 - sampleSize * 0.4 + (volatilityPct ?? 20) * 0.18,
    10,
    35
  )
  const lower =
    estimatedTotal != null ? Math.round(estimatedTotal * (1 - rangeBandPct / 100)) : null
  const upper =
    estimatedTotal != null ? Math.round(estimatedTotal * (1 + rangeBandPct / 100)) : null

  const confidence = round1(
    clamp(
      38 +
        Math.min(sampleSize, 30) * 1.4 +
        (officialLatest ? 8 : 0) -
        (volatilityPct ?? 20) * 0.45,
      35,
      85
    )
  )

  let grade: LandValuationGrade = 'insufficient'
  if (adjustedEstimate != null && Number(input.parcel.latest_price_per_m2) > 0) {
    const latest = Number(input.parcel.latest_price_per_m2)
    if (latest <= adjustedEstimate * 0.9) grade = 'undervalued'
    else if (latest >= adjustedEstimate * 1.1) grade = 'overvalued'
    else grade = 'fair'
  } else if (adjustedEstimate != null) {
    grade = 'fair'
  }

  const factors: LandValuationFactor[] = []
  if (localMedian != null) {
    factors.push({
      label: '인근 실거래 중앙가',
      impact: 'positive',
      description: `최근 인근 거래 ${sampleSize}건을 반영했습니다.`,
    })
  }
  if (officialLatest) {
    factors.push({
      label: '개별공시지가',
      impact: 'neutral',
      description: `${officialLatest.price_year}년 공시지가를 보조 지표로 반영했습니다.`,
    })
  }
  if (totalAdjustment > 0.02) {
    factors.push({
      label: '용도/지목 가중치',
      impact: 'positive',
      description: '용도지역과 지목 특성을 반영해 추정가를 상향 조정했습니다.',
    })
  } else if (totalAdjustment < -0.02) {
    factors.push({
      label: '용도/지목 가중치',
      impact: 'negative',
      description: '용도지역과 지목 특성을 반영해 추정가를 하향 조정했습니다.',
    })
  }
  if (volatilityPct != null && volatilityPct > 30) {
    factors.push({
      label: '거래 변동성',
      impact: 'negative',
      description: `변동성 ${round1(volatilityPct)}%로 추정 범위를 넓게 잡았습니다.`,
    })
  }

  return {
    estimated_price_per_m2: adjustedEstimate,
    estimated_total_price: estimatedTotal,
    lower_bound_price: lower,
    upper_bound_price: upper,
    confidence_score: confidence,
    valuation_grade: grade,
    sample_size: sampleSize,
    volatility_pct: volatilityPct == null ? null : round1(volatilityPct),
    factors: factors.slice(0, 4),
    model_version: 'land-beta-v0',
    disclaimer: '베타 추정값입니다. 거래 표본과 지목/용도 정보에 따라 오차가 있을 수 있습니다.',
  }
}

function toLandMlRequest(
  input: BuildLandValuationInput,
  derived: DerivedMetrics
): LandMlPredictRequest {
  return {
    pnu: input.parcel.pnu,
    land_category: input.parcel.land_category,
    zoning: input.parcel.zoning,
    area_m2: input.parcel.area_m2,
    latest_price_per_m2: input.parcel.latest_price_per_m2,
    local_median_price_per_m2: derived.localMedian,
    local_mean_price_per_m2: derived.localMean,
    official_price_per_m2: derived.officialLatest
      ? Number(derived.officialLatest.official_price_per_m2)
      : null,
    momentum_6m_pct: derived.momentumPct,
    volatility_pct:
      derived.localStd != null && derived.localMean != null && derived.localMean > 0
        ? round1((derived.localStd / derived.localMean) * 100)
        : null,
    sample_size: derived.sampleSize,
  }
}

function normalizeGrade(value: string): LandValuationGrade {
  if (value === 'undervalued') return 'undervalued'
  if (value === 'fair') return 'fair'
  if (value === 'overvalued') return 'overvalued'
  return 'insufficient'
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function normalizeFactors(
  factors: LandMlPredictResponse['factors']
): LandValuationFactor[] {
  if (!Array.isArray(factors)) return []
  return factors
    .map((factor) => {
      const impact: LandValuationFactor['impact'] =
        factor.impact === 'positive' ||
        factor.impact === 'negative' ||
        factor.impact === 'neutral'
          ? factor.impact
          : 'neutral'

      if (typeof factor.label !== 'string' || typeof factor.description !== 'string') {
        return null
      }

      return {
        label: factor.label,
        impact,
        description: factor.description,
      }
    })
    .filter((factor): factor is LandValuationFactor => factor != null)
    .slice(0, 5)
}

function isValidMlResponse(
  data: unknown
): data is LandMlPredictResponse {
  if (!data || typeof data !== 'object') return false
  const row = data as Record<string, unknown>
  return (
    row.model_version != null &&
    typeof row.model_version === 'string' &&
    row.valuation_grade != null &&
    typeof row.valuation_grade === 'string'
  )
}

export function buildLandValuationSummary(
  input: BuildLandValuationInput
): LandValuationSummary {
  return buildFallbackSummary(input, buildDerivedMetrics(input))
}

export async function buildLandValuationSummaryWithMl(
  input: BuildLandValuationInput
): Promise<LandValuationSummary> {
  const derived = buildDerivedMetrics(input)
  const fallback = buildFallbackSummary(input, derived)

  if (!LAND_ML_API_URL) {
    return fallback
  }

  const payload = toLandMlRequest(input, derived)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)

    const response = await fetch(`${LAND_ML_API_URL}/api/land/predict`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return fallback
    }

    const data = (await response.json()) as unknown
    if (!isValidMlResponse(data)) {
      return fallback
    }

    const ml = data as LandMlPredictResponse
    const factors = normalizeFactors(ml.factors)

    return {
      estimated_price_per_m2:
        asNullableNumber(ml.estimated_price_per_m2) ?? fallback.estimated_price_per_m2,
      estimated_total_price:
        asNullableNumber(ml.estimated_total_price) ?? fallback.estimated_total_price,
      lower_bound_price:
        asNullableNumber(ml.lower_bound_price) ?? fallback.lower_bound_price,
      upper_bound_price:
        asNullableNumber(ml.upper_bound_price) ?? fallback.upper_bound_price,
      confidence_score:
        typeof ml.confidence_score === 'number' && Number.isFinite(ml.confidence_score)
          ? round1(clamp(ml.confidence_score, 0, 100))
          : fallback.confidence_score,
      valuation_grade: normalizeGrade(ml.valuation_grade),
      sample_size:
        typeof ml.sample_size === 'number' && Number.isFinite(ml.sample_size)
          ? Math.max(0, Math.round(ml.sample_size))
          : fallback.sample_size,
      volatility_pct:
        asNullableNumber(ml.volatility_pct) ?? fallback.volatility_pct,
      factors: factors.length > 0 ? factors : fallback.factors,
      model_version: ml.model_version || fallback.model_version,
      disclaimer: ml.disclaimer || fallback.disclaimer,
    }
  } catch {
    return fallback
  }
}
