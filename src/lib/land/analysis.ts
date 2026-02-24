import type { LandParcel, LandTransaction } from '@/types/land'

export type LandInvestmentGrade =
  | 'strong'
  | 'watch'
  | 'cautious'
  | 'insufficient'

export interface LandAnalysisSummary {
  overall_score: number | null
  investment_grade: LandInvestmentGrade
  price_position_pct: number | null
  local_median_price_per_m2: number | null
  local_avg_price_per_m2: number | null
  liquidity_12m: number
  momentum_6m_pct: number | null
  volatility_pct: number | null
  sample_size: number
  nearby_sample_size: number
  signals: string[]
}

interface BuildLandAnalysisInput {
  parcel: LandParcel
  transactions: LandTransaction[]
  nearbyTransactions: LandTransaction[]
}

function toValidPricePerM2(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
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
    values.reduce((sum, v) => sum + (v - avg) * (v - avg), 0) / values.length
  return Math.sqrt(variance)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function gradeFromScore(
  score: number | null,
  sampleSize: number
): LandInvestmentGrade {
  if (score == null || sampleSize < 5) return 'insufficient'
  if (score >= 75) return 'strong'
  if (score >= 55) return 'watch'
  return 'cautious'
}

function scoreLabel(grade: LandInvestmentGrade): string {
  switch (grade) {
    case 'strong':
      return '거래 유동성과 가격 구간이 우호적입니다.'
    case 'watch':
      return '진입 가능 구간이지만 추가 확인이 필요합니다.'
    case 'cautious':
      return '가격 또는 변동성이 불리해 보수 접근이 필요합니다.'
    default:
      return '표본이 부족해 신뢰도 있는 판정이 어렵습니다.'
  }
}

export function buildLandAnalysisSummary(
  input: BuildLandAnalysisInput
): LandAnalysisSummary {
  const pricedTxRows = input.transactions
    .map((tx) => {
      const price = toValidPricePerM2(tx.price_per_m2)
      if (price == null) return null
      const ts = Date.parse(tx.transaction_date)
      if (!Number.isFinite(ts)) return null
      return { price, ts }
    })
    .filter((v): v is { price: number; ts: number } => v != null)

  const pricedNearbyRows = input.nearbyTransactions
    .map((tx) => {
      const price = toValidPricePerM2(tx.price_per_m2)
      if (price == null) return null
      const ts = Date.parse(tx.transaction_date)
      if (!Number.isFinite(ts)) return null
      return { price, ts }
    })
    .filter((v): v is { price: number; ts: number } => v != null)

  const txPrices = pricedTxRows.map((row) => row.price)
  const nearbyPrices = pricedNearbyRows.map((row) => row.price)
  const localPrices = [...txPrices, ...nearbyPrices]
  const pricedRows = [...pricedTxRows, ...pricedNearbyRows]

  const subjectPricePerM2 =
    toValidPricePerM2(input.parcel.latest_price_per_m2) ?? txPrices[0] ?? null

  const localMedian = median(localPrices)
  const localAvg = mean(localPrices)
  const localStd = std(localPrices)

  const now = Date.now()
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000
  const liquidity12m = [...input.transactions, ...input.nearbyTransactions].filter(
    (tx) => {
      const ts = Date.parse(tx.transaction_date)
      return Number.isFinite(ts) && ts >= oneYearAgo
    }
  ).length

  const recentCutoff = now - 180 * 24 * 60 * 60 * 1000
  const previousCutoff = now - 360 * 24 * 60 * 60 * 1000
  const recentPrices = pricedRows
    .filter((row) => row.ts >= recentCutoff)
    .map((row) => row.price)
  const previousPrices = pricedRows
    .filter((row) => row.ts < recentCutoff && row.ts >= previousCutoff)
    .map((row) => row.price)

  const recentAvg = mean(recentPrices)
  const previousAvg = mean(previousPrices)
  const momentum =
    recentAvg != null && previousAvg != null && previousAvg > 0
      ? ((recentAvg - previousAvg) / previousAvg) * 100
      : null

  const pricePositionPct =
    subjectPricePerM2 != null && localMedian != null && localMedian > 0
      ? (subjectPricePerM2 / localMedian) * 100
      : null

  const volatilityPct =
    localStd != null && localAvg != null && localAvg > 0
      ? (localStd / localAvg) * 100
      : null

  let priceComponent = 50
  if (pricePositionPct != null) {
    if (pricePositionPct <= 85) priceComponent = 95
    else if (pricePositionPct <= 100) priceComponent = 85
    else if (pricePositionPct <= 110) priceComponent = 70
    else if (pricePositionPct <= 125) priceComponent = 45
    else priceComponent = 20
  }

  let liquidityComponent = 25
  if (liquidity12m >= 25) liquidityComponent = 95
  else if (liquidity12m >= 15) liquidityComponent = 80
  else if (liquidity12m >= 8) liquidityComponent = 65
  else if (liquidity12m >= 4) liquidityComponent = 45

  const momentumComponent =
    momentum == null ? 50 : clamp(50 + momentum * 1.5, 15, 95)
  const volatilityPenalty =
    volatilityPct == null ? 0 : clamp((volatilityPct - 30) * 0.8, 0, 15)

  const rawScore =
    priceComponent * 0.4 +
    liquidityComponent * 0.35 +
    momentumComponent * 0.25 -
    volatilityPenalty

  const overall = localPrices.length
    ? Math.round(clamp(rawScore, 0, 100) * 10) / 10
    : null

  const grade = gradeFromScore(overall, localPrices.length)
  const signals: string[] = [scoreLabel(grade)]

  if (pricePositionPct != null) {
    if (pricePositionPct <= 95) {
      signals.push('인근 중앙값 대비 가격이 낮거나 유사합니다.')
    } else if (pricePositionPct >= 115) {
      signals.push('인근 중앙값 대비 가격이 높은 편입니다.')
    }
  }

  if (liquidity12m < 5) {
    signals.push('최근 12개월 거래가 적어 유동성 리스크가 있습니다.')
  } else if (liquidity12m >= 15) {
    signals.push('최근 12개월 거래가 충분해 유동성이 양호합니다.')
  }

  if (momentum != null) {
    if (momentum > 5) {
      signals.push('최근 6개월 단가가 상승 추세입니다.')
    } else if (momentum < -5) {
      signals.push('최근 6개월 단가가 하락 추세입니다.')
    }
  }

  return {
    overall_score: overall,
    investment_grade: grade,
    price_position_pct:
      pricePositionPct == null ? null : Math.round(pricePositionPct * 10) / 10,
    local_median_price_per_m2:
      localMedian == null ? null : Math.round(localMedian),
    local_avg_price_per_m2: localAvg == null ? null : Math.round(localAvg),
    liquidity_12m: liquidity12m,
    momentum_6m_pct: momentum == null ? null : Math.round(momentum * 10) / 10,
    volatility_pct:
      volatilityPct == null ? null : Math.round(volatilityPct * 10) / 10,
    sample_size: localPrices.length,
    nearby_sample_size: nearbyPrices.length,
    signals: signals.slice(0, 4),
  }
}
