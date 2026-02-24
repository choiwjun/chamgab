import { createAdminClient } from '@/lib/supabase/admin'

type AnyRow = Record<string, unknown>

export const COMMERCIAL_THRESHOLDS = {
  lowProbHighConfidencePctMax: 3,
  highProbBucketPctMin: 5,
  highProbBucketPctMax: 20,
  sigunguCoverageMin: 227,
  freshnessMonthsMax: 3,
  snapshotAgeHoursMax: 24,
} as const

export type CommercialGateCheck = {
  key: string
  label: string
  value: number | null
  target: string
  pass: boolean
  available: boolean
  source: string
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export async function getLatestCommercialQualitySnapshot() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('commercial_quality_snapshots')
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as AnyRow | null) ?? null
}

export function evaluateCommercialSnapshotGate(snapshot: AnyRow | null): {
  pass: boolean
  checks: CommercialGateCheck[]
  metrics: Record<string, unknown> | null
} {
  if (!snapshot) {
    return { pass: false, checks: [], metrics: null }
  }

  const computedAt = String(snapshot.computed_at || '')
  const snapshotAgeHours = computedAt
    ? round2((Date.now() - new Date(computedAt).getTime()) / 3_600_000)
    : null

  const coverageBusiness = toNumber(snapshot.sigungu_coverage_business)
  const coverageSales = toNumber(snapshot.sigungu_coverage_sales)
  const coverageStore = toNumber(snapshot.sigungu_coverage_store)
  const coverageMin =
    coverageBusiness == null || coverageSales == null || coverageStore == null
      ? null
      : Math.min(coverageBusiness, coverageSales, coverageStore)

  const lowProbHighConfPct = toNumber(
    snapshot.low_prob_high_confidence_ratio_pct
  )
  const highBucketPct = toNumber(snapshot.high_prob_bucket_pct)
  const freshnessMonthsMax = toNumber(snapshot.freshness_months_max)
  const details = (snapshot.details as AnyRow | null) ?? null
  const mojibakeDetectedCount = toNumber(details?.mojibake_detected_count)

  const checks: CommercialGateCheck[] = [
    {
      key: 'low_prob_high_confidence_pct',
      label: 'Low-probability/high-confidence ratio (%)',
      value: lowProbHighConfPct,
      target: `<= ${COMMERCIAL_THRESHOLDS.lowProbHighConfidencePctMax}`,
      pass:
        lowProbHighConfPct != null &&
        lowProbHighConfPct <= COMMERCIAL_THRESHOLDS.lowProbHighConfidencePctMax,
      available: lowProbHighConfPct != null,
      source: 'db:commercial_quality_snapshots',
    },
    {
      key: 'high_prob_bucket_pct',
      label: 'High probability bucket share (%)',
      value: highBucketPct,
      target: `${COMMERCIAL_THRESHOLDS.highProbBucketPctMin} ~ ${COMMERCIAL_THRESHOLDS.highProbBucketPctMax}`,
      pass:
        highBucketPct != null &&
        highBucketPct >= COMMERCIAL_THRESHOLDS.highProbBucketPctMin &&
        highBucketPct <= COMMERCIAL_THRESHOLDS.highProbBucketPctMax,
      available: highBucketPct != null,
      source: 'db:commercial_quality_snapshots',
    },
    {
      key: 'sigungu_coverage',
      label: 'Sigungu coverage',
      value: coverageMin,
      target: `>= ${COMMERCIAL_THRESHOLDS.sigunguCoverageMin}`,
      pass:
        coverageMin != null &&
        coverageMin >= COMMERCIAL_THRESHOLDS.sigunguCoverageMin,
      available: coverageMin != null,
      source: 'db:commercial_quality_snapshots',
    },
    {
      key: 'freshness_months_max',
      label: 'Data freshness lag (months)',
      value: freshnessMonthsMax,
      target: `<= ${COMMERCIAL_THRESHOLDS.freshnessMonthsMax}`,
      pass:
        freshnessMonthsMax != null &&
        freshnessMonthsMax <= COMMERCIAL_THRESHOLDS.freshnessMonthsMax,
      available: freshnessMonthsMax != null,
      source: 'db:commercial_quality_snapshots',
    },
    {
      key: 'snapshot_age_hours',
      label: 'Snapshot age (hours)',
      value: snapshotAgeHours,
      target: `<= ${COMMERCIAL_THRESHOLDS.snapshotAgeHoursMax}`,
      pass:
        snapshotAgeHours != null &&
        snapshotAgeHours <= COMMERCIAL_THRESHOLDS.snapshotAgeHoursMax,
      available: snapshotAgeHours != null,
      source: 'db:commercial_quality_snapshots',
    },
    {
      key: 'mojibake_detected_count',
      label: 'Mojibake detected count',
      value: mojibakeDetectedCount,
      target: '= 0',
      pass: mojibakeDetectedCount != null && mojibakeDetectedCount === 0,
      available: mojibakeDetectedCount != null,
      source: 'db:commercial_quality_snapshots.details',
    },
  ]

  return {
    pass: checks.every((check) => check.pass),
    checks,
    metrics: {
      snapshot_id: snapshot.id ?? null,
      snapshot_computed_at: snapshot.computed_at ?? null,
      snapshot_age_hours: snapshotAgeHours,
      combo_count: toNumber(snapshot.combo_count),
      low_prob_high_confidence_count: toNumber(
        snapshot.low_prob_high_confidence_count
      ),
      low_prob_high_confidence_ratio_pct: lowProbHighConfPct,
      high_prob_bucket_count: toNumber(snapshot.high_prob_bucket_count),
      high_prob_bucket_pct: highBucketPct,
      sigungu_coverage: coverageMin,
      sigungu_coverage_by_table: {
        business_statistics: coverageBusiness,
        sales_statistics: coverageSales,
        store_statistics: coverageStore,
      },
      freshness_months_max: freshnessMonthsMax,
      distribution_summary: snapshot.distribution_summary ?? {},
      details,
      thresholds: COMMERCIAL_THRESHOLDS,
    },
  }
}
