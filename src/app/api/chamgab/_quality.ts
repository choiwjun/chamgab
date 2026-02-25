import type { SupabaseClient } from '@supabase/supabase-js'

export type ChamgabGapBand = 'safe' | 'watch' | 'severe' | 'unknown'
export type ChamgabQualityFlag =
  | 'FACTOR_MISSING'
  | 'FACTOR_INCOMPLETE'
  | 'GAP_WATCH'
  | 'GAP_SEVERE'
  | 'NO_TRANSACTION_BENCHMARK'
  | 'LOW_CONFIDENCE'

export interface ChamgabQuality {
  factor_count: number
  factor_complete: boolean
  gap_band: ChamgabGapBand
  calibration_version: string
  quality_flags: ChamgabQualityFlag[]
}

interface BuildChamgabQualityParams {
  analysisId?: string | null
  propertyId?: string | null
  chamgabPrice?: number | null
  confidence?: number | null
  factorTarget?: number
  calibrationVersion?: string
}

const DEFAULT_FACTOR_TARGET = 10
const WATCH_GAP_PCT = 15
const SEVERE_GAP_PCT = 25
const DEFAULT_CALIBRATION_VERSION = 'apt-gap-v1'

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

async function getFactorCount(
  admin: SupabaseClient,
  analysisId: string | null | undefined
): Promise<number> {
  if (!analysisId) return 0
  const { count } = await admin
    .from('price_factors')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_id', analysisId)
  return count ?? 0
}

async function getLatestTransactionPrice(
  admin: SupabaseClient,
  propertyId: string | null | undefined
): Promise<number | null> {
  if (!propertyId) return null

  const { data, error } = await admin
    .from('transactions')
    .select('price,transaction_date')
    .eq('property_id', propertyId)
    .order('transaction_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const price = toFiniteNumber(data.price)
  if (price == null || price <= 0) return null
  return price
}

function getGapBand(
  chamgabPrice: number | null,
  latestTxPrice: number | null
): ChamgabGapBand {
  if (chamgabPrice == null || chamgabPrice <= 0 || latestTxPrice == null) {
    return 'unknown'
  }
  const absGapPct =
    Math.abs((chamgabPrice - latestTxPrice) / latestTxPrice) * 100
  if (!Number.isFinite(absGapPct)) return 'unknown'
  if (absGapPct >= SEVERE_GAP_PCT) return 'severe'
  if (absGapPct >= WATCH_GAP_PCT) return 'watch'
  return 'safe'
}

function buildQualityFlags(params: {
  factorCount: number
  factorTarget: number
  gapBand: ChamgabGapBand
  hasTransactionBenchmark: boolean
  confidence: number | null
}): ChamgabQualityFlag[] {
  const flags: ChamgabQualityFlag[] = []

  if (params.factorCount <= 0) flags.push('FACTOR_MISSING')
  else if (params.factorCount < params.factorTarget)
    flags.push('FACTOR_INCOMPLETE')

  if (!params.hasTransactionBenchmark) flags.push('NO_TRANSACTION_BENCHMARK')
  if (params.gapBand === 'watch') flags.push('GAP_WATCH')
  if (params.gapBand === 'severe') flags.push('GAP_SEVERE')
  if (params.confidence != null && params.confidence < 0.55) {
    flags.push('LOW_CONFIDENCE')
  }

  return flags
}

export async function buildChamgabQuality(
  admin: SupabaseClient,
  params: BuildChamgabQualityParams
): Promise<ChamgabQuality> {
  const factorTarget = Math.max(
    1,
    Math.trunc(params.factorTarget ?? DEFAULT_FACTOR_TARGET)
  )
  const calibrationVersion =
    (params.calibrationVersion || process.env.CHAMGAB_CALIBRATION_VERSION || '')
      .trim()
      .slice(0, 64) || DEFAULT_CALIBRATION_VERSION

  const [factorCount, latestTxPrice] = await Promise.all([
    getFactorCount(admin, params.analysisId),
    getLatestTransactionPrice(admin, params.propertyId),
  ])

  const chamgabPrice = toFiniteNumber(params.chamgabPrice)
  const confidenceRaw = toFiniteNumber(params.confidence)
  const confidence =
    confidenceRaw == null
      ? null
      : confidenceRaw > 1
        ? Math.min(Math.max(confidenceRaw / 100, 0), 1)
        : Math.min(Math.max(confidenceRaw, 0), 1)
  const gapBand = getGapBand(chamgabPrice, latestTxPrice)
  const qualityFlags = buildQualityFlags({
    factorCount,
    factorTarget,
    gapBand,
    hasTransactionBenchmark: latestTxPrice != null,
    confidence,
  })

  return {
    factor_count: factorCount,
    factor_complete: factorCount >= factorTarget,
    gap_band: gapBand,
    calibration_version: calibrationVersion,
    quality_flags: qualityFlags,
  }
}
