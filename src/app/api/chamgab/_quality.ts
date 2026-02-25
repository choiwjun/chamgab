import { createAdminClient } from '@/lib/supabase/admin'

const CHAMGAB_FACTOR_TARGET = (() => {
  const parsed = Number(process.env.CHAMGAB_FACTOR_TARGET || 10)
  if (!Number.isFinite(parsed)) return 10
  return Math.min(Math.max(Math.trunc(parsed), 1), 30)
})()

const CHAMGAB_CALIBRATION_VERSION =
  process.env.CHAMGAB_CALIBRATION_VERSION || 'chamgab-cal-v1'
const CHAMGAB_QUALITY_VERSION =
  process.env.CHAMGAB_QUALITY_VERSION || 'chamgab-quality-v1'

type AdminDbClient = ReturnType<typeof createAdminClient>

export type QualityGateStatus = 'pass' | 'warn' | 'fail'
export type QualityGrade = 'A' | 'B' | 'C' | 'D'

type GapBand = 'safe' | 'watch' | 'severe' | 'unknown'

export type ChamgabQualityPayload = {
  factor_count: number
  factor_complete: boolean
  gap_band: GapBand
  calibration_version: string
  quality_flags: string[]
  benchmark_price: number | null
  benchmark_transaction_at: string | null
  abs_gap_pct: number | null
  confidence_pct: number | null
}

type BuildChamgabQualityArgs = {
  analysisId: string | null
  propertyId: string | null
  chamgabPrice: number | null | undefined
  confidence: number | null | undefined
}

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeConfidence(value: unknown): number | null {
  const parsed = toNumber(value)
  if (parsed == null) return null
  const pct = parsed <= 1 ? parsed * 100 : parsed
  return Math.min(Math.max(pct, 0), 100)
}

async function getFactorCount(
  admin: AdminDbClient,
  analysisId: string | null
): Promise<number> {
  if (!analysisId) return 0

  const { count, error } = await admin
    .from('price_factors')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_id', analysisId)

  if (error) return 0
  return Number(count || 0)
}

async function getLatestTransactionBenchmark(
  admin: AdminDbClient,
  propertyId: string | null
): Promise<{ price: number | null; transactionDate: string | null }> {
  if (!propertyId) {
    return { price: null, transactionDate: null }
  }

  const { data, error } = await admin
    .from('transactions')
    .select('price,transaction_date')
    .eq('property_id', propertyId)
    .order('transaction_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return { price: null, transactionDate: null }
  }

  const price = toNumber(data.price)
  const transactionDate =
    typeof data.transaction_date === 'string' && data.transaction_date.trim()
      ? data.transaction_date
      : null

  return {
    price: price && price > 0 ? price : null,
    transactionDate,
  }
}

export async function buildChamgabQuality(
  admin: AdminDbClient,
  args: BuildChamgabQualityArgs
): Promise<ChamgabQualityPayload> {
  const [factorCount, benchmark] = await Promise.all([
    getFactorCount(admin, args.analysisId),
    getLatestTransactionBenchmark(admin, args.propertyId),
  ])

  const flags: string[] = []
  if (factorCount <= 0) {
    flags.push('FACTOR_MISSING')
  } else if (factorCount < CHAMGAB_FACTOR_TARGET) {
    flags.push('FACTOR_INCOMPLETE')
  }

  const chamgabPrice = toNumber(args.chamgabPrice)
  const benchmarkPrice = benchmark.price
  let gapBand: GapBand = 'unknown'
  let absGapPct: number | null = null

  if (benchmarkPrice == null || chamgabPrice == null || chamgabPrice <= 0) {
    flags.push('NO_TRANSACTION_BENCHMARK')
  } else {
    absGapPct = Math.abs(((chamgabPrice - benchmarkPrice) / benchmarkPrice) * 100)
    if (absGapPct >= 25) {
      gapBand = 'severe'
      flags.push('GAP_SEVERE')
    } else if (absGapPct >= 15) {
      gapBand = 'watch'
      flags.push('GAP_WATCH')
    } else {
      gapBand = 'safe'
    }
  }

  const confidencePct = normalizeConfidence(args.confidence)
  if (confidencePct != null && confidencePct < 60) {
    flags.push('LOW_CONFIDENCE')
  }

  return {
    factor_count: factorCount,
    factor_complete: factorCount >= CHAMGAB_FACTOR_TARGET,
    gap_band: gapBand,
    calibration_version: CHAMGAB_CALIBRATION_VERSION,
    quality_flags: Array.from(new Set(flags)),
    benchmark_price: benchmarkPrice,
    benchmark_transaction_at: benchmark.transactionDate,
    abs_gap_pct: absGapPct == null ? null : Number(absGapPct.toFixed(2)),
    confidence_pct:
      confidencePct == null ? null : Number(confidencePct.toFixed(2)),
  }
}

export function deriveChamgabQualityMeta(
  qualityFlags: string[] = [],
  analyzedAt?: unknown
): {
  quality_gate_status: QualityGateStatus
  quality_grade: QualityGrade
  quality_version: string
  quality_flags: string[]
  data_freshness: string | null
} {
  const hasFail =
    qualityFlags.includes('FACTOR_MISSING') ||
    qualityFlags.includes('GAP_SEVERE') ||
    qualityFlags.includes('NO_TRANSACTION_BENCHMARK')

  const hasWarn =
    qualityFlags.includes('FACTOR_INCOMPLETE') ||
    qualityFlags.includes('GAP_WATCH') ||
    qualityFlags.includes('LOW_CONFIDENCE')

  const qualityGateStatus: QualityGateStatus = hasFail
    ? 'fail'
    : hasWarn
      ? 'warn'
      : 'pass'

  const qualityGrade: QualityGrade =
    qualityGateStatus === 'fail'
      ? 'D'
      : qualityGateStatus === 'warn'
        ? 'C'
        : qualityFlags.length === 0
          ? 'A'
          : 'B'

  return {
    quality_gate_status: qualityGateStatus,
    quality_grade: qualityGrade,
    quality_version: CHAMGAB_QUALITY_VERSION,
    quality_flags: qualityFlags,
    data_freshness:
      typeof analyzedAt === 'string' && analyzedAt.trim().length > 0
        ? analyzedAt
        : null,
  }
}
