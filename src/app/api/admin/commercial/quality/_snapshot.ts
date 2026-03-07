import { createAdminClient } from '@/lib/supabase/admin'
import { FACTOR_NAME_MAP, INDUSTRY_NAMES } from '@/app/api/commercial/_helpers'

type AnyRow = Record<string, unknown>
type AdminClient = ReturnType<typeof createAdminClient>

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function envString(name: string, fallback: string): string {
  const raw = (process.env[name] || '').trim()
  return raw || fallback
}

export const COMMERCIAL_THRESHOLDS = {
  lowProbHighConfidencePctMax: 3,
  highProbBucketPctMin: envNumber('COMMERCIAL_HIGH_PROB_BUCKET_PCT_MIN', 1),
  highProbBucketPctMax: envNumber('COMMERCIAL_HIGH_PROB_BUCKET_PCT_MAX', 20),
  sigunguCoverageMin: 227,
  freshnessMonthsMax: 3,
  snapshotAgeHoursMax: 24,
} as const

export const COMMERCIAL_QUALITY_VERSION = 'commercial-quality-v1'
export const COMMERCIAL_CALIBRATION_VERSION = envString(
  'COMMERCIAL_CALIBRATION_VERSION',
  'commercial-cal-v4'
)

export type CommercialQualitySnapshotPayload = {
  computed_at: string
  combo_count: number
  low_prob_high_confidence_count: number
  low_prob_high_confidence_ratio_pct: number
  high_prob_bucket_count: number
  high_prob_bucket_pct: number
  sigungu_coverage_business: number
  sigungu_coverage_sales: number
  sigungu_coverage_store: number
  freshness_months_max: number
  distribution_summary: Record<string, unknown>
  pass: boolean
  details: Record<string, unknown>
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// Keep commercial quality gate calibration aligned with
// ml-api/scripts/build_commercial_quality_snapshot.py.
function compressCommercialQualityProbability(raw: number): number {
  const x = clamp(raw, 0, 100)
  if (x < 40) return round2(40 - (40 - x) * 0.75)
  if (x < 70) return round2(40 + (x - 40) * 0.95)
  if (x < 85) return round2(68.5 + (x - 70) * 0.7)
  return round2(79 + (x - 85) * 0.6)
}

function monthsSince(yyyymm: string | null): number | null {
  if (!yyyymm || !/^\d{6}$/.test(yyyymm)) return null
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

function summarize(values: number[]) {
  if (values.length === 0) {
    return {
      count: 0,
      mean: null,
      min: null,
      max: null,
      p10: null,
      p50: null,
      p90: null,
    }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const pick = (q: number) => {
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor((sorted.length - 1) * q))
    )
    return round2(sorted[idx] as number)
  }

  const sum = sorted.reduce((acc, n) => acc + n, 0)
  return {
    count: sorted.length,
    mean: round2(sum / sorted.length),
    min: round2(sorted[0] as number),
    max: round2(sorted[sorted.length - 1] as number),
    p10: pick(0.1),
    p50: pick(0.5),
    p90: pick(0.9),
  }
}

async function distinctSigunguCount(
  admin: AdminClient,
  table: string
): Promise<number> {
  const codes = new Set<string>()
  const pageSize = 1000
  let offset = 0

  while (offset < 500_000) {
    const { data, error } = await admin
      .from(table)
      .select('sigungu_code')
      .not('sigungu_code', 'is', 'null')
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const row of data as unknown as AnyRow[]) {
      const code = String(row.sigungu_code || '').trim()
      if (code) codes.add(code)
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return codes.size
}

async function latestMonth(
  admin: AdminClient,
  table: string
): Promise<string | null> {
  const { data, error } = await admin
    .from(table)
    .select('base_year_month')
    .order('base_year_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const value = String(data?.base_year_month || '').trim()
  return value || null
}

async function fetchLatestByCombo(
  admin: AdminClient,
  table: string,
  extraColumns: string
): Promise<Map<string, AnyRow>> {
  const rowsByCombo = new Map<string, AnyRow>()
  const pageSize = 1000
  let offset = 0

  const columns = `sigungu_code,industry_small_code,base_year_month,${extraColumns}`

  while (offset < 900_000) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('base_year_month', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const row of data as unknown as AnyRow[]) {
      const sigunguCode = String(row.sigungu_code || '').trim()
      const industryCode = String(row.industry_small_code || '').trim()
      if (!sigunguCode || !industryCode) continue
      const key = `${sigunguCode}:${industryCode}`
      if (!rowsByCombo.has(key)) rowsByCombo.set(key, row)
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return rowsByCombo
}

async function fetchLatestDistrictProfiles(
  admin: AdminClient
): Promise<Map<string, AnyRow>> {
  const profiles = new Map<string, AnyRow>()
  const pageSize = 1000
  let offset = 0
  let useSigunguColumn = true

  while (offset < 500_000) {
    const selectColumns = useSigunguColumn
      ? 'sigungu_code,commercial_district_code,base_year_quarter,district_type,resident_ratio,office_worker_ratio,student_ratio,weekend_sales_ratio'
      : 'commercial_district_code,base_year_quarter,district_type,resident_ratio,office_worker_ratio,student_ratio,weekend_sales_ratio'

    const { data, error } = await admin
      .from('district_characteristics')
      .select(selectColumns)
      .order('base_year_quarter', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) {
      if (useSigunguColumn && /sigungu_code/i.test(error.message || '')) {
        useSigunguColumn = false
        offset = 0
        profiles.clear()
        continue
      }
      throw new Error(error.message)
    }
    if (!data || data.length === 0) break

    for (const row of data as unknown as AnyRow[]) {
      let sigunguCode = String(row.sigungu_code || '').trim()
      if (!sigunguCode) {
        const districtCode = String(row.commercial_district_code || '').trim()
        if (districtCode.length >= 5) sigunguCode = districtCode.slice(0, 5)
      }
      if (!sigunguCode) continue
      if (!profiles.has(sigunguCode)) profiles.set(sigunguCode, row)
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return profiles
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

function calcIndustryFitAdjustment(args: {
  industryCode: string
  districtType: string
  residentRatio: number | null
  officeWorkerRatio: number | null
  studentRatio: number | null
  weekendSalesRatio: number | null
}) {
  const cluster = resolveIndustryCluster(args.industryCode)
  const districtType = args.districtType.toLowerCase()
  const resident = args.residentRatio ?? 0
  const office = args.officeWorkerRatio ?? 0
  const student = args.studentRatio ?? 0
  const weekend = args.weekendSalesRatio ?? 0

  let adjustment = 0

  if (cluster === 'funeral') {
    if (resident >= 55) adjustment -= 10
    if (office <= 25) adjustment -= 2.5
    if (
      districtType.includes('residential') ||
      districtType.includes('주거') ||
      districtType.includes('아파트')
    ) {
      adjustment -= 5.5
    }
  } else if (cluster === 'fuel') {
    if (resident >= 60) adjustment -= 5
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

  const normalized = round2(clamp(adjustment, -24, 10))
  const policyPenalty = round2(Math.min(12, Math.max(0, -normalized) * 0.65))
  return { adjustment: normalized, policyPenalty }
}

function estimateRawProbability(args: {
  survivalRate: number
  monthlyAvgSales: number
  salesGrowthRate: number
  storeCount: number
  franchiseRatio: number
}): number {
  const survivalComp = clamp(args.survivalRate, 0, 100) * 0.35
  const salesComp = clamp(
    Math.log10(Math.max(args.monthlyAvgSales, 5_000_000) / 5_000_000) * 12.5,
    0,
    22
  )
  const growthComp = clamp(args.salesGrowthRate * 2.5, -5, 16)
  const franchiseComp = clamp(args.franchiseRatio * 25, 0, 8)
  const storeComp =
    args.storeCount < 10
      ? 3
      : args.storeCount < 30
        ? 5
        : args.storeCount <= 300
          ? 8
          : 6
  return round2(
    clamp(
      10 + survivalComp + salesComp + growthComp + franchiseComp + storeComp,
      0,
      100
    )
  )
}

function calcRuleConfidence(args: {
  hasBiz: boolean
  hasSales: boolean
  hasStore: boolean
  bizFreshness: number | null
  salesFreshness: number | null
  storeFreshness: number | null
}): number {
  let score = 45
  if (args.hasBiz) score += 18
  if (args.hasSales) score += 18
  if (args.hasStore) score += 18

  const recencyBonus = (months: number | null) => {
    if (months == null) return 0
    if (months <= 3) return 4
    if (months <= 6) return 2
    return 0
  }

  score +=
    recencyBonus(args.bizFreshness) +
    recencyBonus(args.salesFreshness) +
    recencyBonus(args.storeFreshness)

  return round2(
    clamp(score, 30, args.hasBiz && args.hasSales && args.hasStore ? 90 : 82)
  )
}

function detectMojibakeCount(values: string[]): number {
  let count = 0
  const hasCjk = /[\u4e00-\u9fff]/
  const suspiciousAscii = /(?:\u00c3|\u00c2|\u00d0|\u00d5)/
  for (const value of values) {
    if (!value) continue
    if (value.includes('\uFFFD')) {
      count += 1
      continue
    }
    if (value.includes('?') || suspiciousAscii.test(value)) {
      count += 1
      continue
    }
    if (hasCjk.test(value)) {
      count += 1
    }
  }
  return count
}

export async function computeCommercialQualitySnapshot(): Promise<CommercialQualitySnapshotPayload> {
  const admin = createAdminClient()
  const [
    bizCoverage,
    salesCoverage,
    storeCoverage,
    bizLatestMonth,
    salesLatestMonth,
    storeLatestMonth,
    bizRows,
    salesRows,
    storeRows,
    districtProfiles,
  ] = await Promise.all([
    distinctSigunguCount(admin, 'business_statistics'),
    distinctSigunguCount(admin, 'sales_statistics'),
    distinctSigunguCount(admin, 'store_statistics'),
    latestMonth(admin, 'business_statistics'),
    latestMonth(admin, 'sales_statistics'),
    latestMonth(admin, 'store_statistics'),
    fetchLatestByCombo(admin, 'business_statistics', 'survival_rate'),
    fetchLatestByCombo(
      admin,
      'sales_statistics',
      'monthly_avg_sales,sales_growth_rate'
    ),
    fetchLatestByCombo(
      admin,
      'store_statistics',
      'store_count,franchise_count'
    ),
    fetchLatestDistrictProfiles(admin),
  ])

  const allKeys = Array.from(
    new Set<string>([
      ...Array.from(bizRows.keys()),
      ...Array.from(salesRows.keys()),
      ...Array.from(storeRows.keys()),
    ])
  )
  const probabilities: number[] = []
  const confidences: number[] = []

  let lowProbHighConfCount = 0
  let highBucketCount = 0
  let staleComboCount = 0
  let missingSourceCount = 0
  let highPolicyPenaltyCount = 0

  for (const key of allKeys) {
    const biz = bizRows.get(key)
    const sales = salesRows.get(key)
    const store = storeRows.get(key)
    const [sigunguCode, industryCode] = key.split(':')

    const hasBiz = !!biz
    const hasSales = !!sales
    const hasStore = !!store
    if (!hasBiz || !hasSales || !hasStore) missingSourceCount += 1

    const survivalRate = toNumber(biz?.survival_rate) ?? 50
    const monthlyAvgSales = toNumber(sales?.monthly_avg_sales) ?? 20_000_000
    const salesGrowthRate = toNumber(sales?.sales_growth_rate) ?? 0
    const storeCount = Math.max(1, toNumber(store?.store_count) ?? 80)
    const franchiseCount = Math.max(0, toNumber(store?.franchise_count) ?? 0)
    const franchiseRatio = clamp(franchiseCount / Math.max(storeCount, 1), 0, 1)

    const rawProbability = estimateRawProbability({
      survivalRate,
      monthlyAvgSales,
      salesGrowthRate,
      storeCount,
      franchiseRatio,
    })
    const calibratedProbability =
      compressCommercialQualityProbability(rawProbability)

    const districtProfile = districtProfiles.get(sigunguCode || '')
    const fit = calcIndustryFitAdjustment({
      industryCode: industryCode || '',
      districtType: String(districtProfile?.district_type || ''),
      residentRatio: toNumber(districtProfile?.resident_ratio),
      officeWorkerRatio: toNumber(districtProfile?.office_worker_ratio),
      studentRatio: toNumber(districtProfile?.student_ratio),
      weekendSalesRatio: toNumber(districtProfile?.weekend_sales_ratio),
    })

    const finalProbability = round2(
      clamp(calibratedProbability + fit.adjustment, 0, 100)
    )
    if (finalProbability >= 80) highBucketCount += 1

    const bizFreshness = monthsSince(String(biz?.base_year_month || ''))
    const salesFreshness = monthsSince(String(sales?.base_year_month || ''))
    const storeFreshness = monthsSince(String(store?.base_year_month || ''))
    const maxFreshness = Math.max(
      bizFreshness ?? 0,
      salesFreshness ?? 0,
      storeFreshness ?? 0
    )
    if (maxFreshness > COMMERCIAL_THRESHOLDS.freshnessMonthsMax)
      staleComboCount += 1

    const ruleConfidence = calcRuleConfidence({
      hasBiz,
      hasSales,
      hasStore,
      bizFreshness,
      salesFreshness,
      storeFreshness,
    })
    const modelConfidence = round2(clamp(45 + rawProbability * 0.55, 45, 96))
    const p = finalProbability / 100
    const decisiveness = 1 - 4 * p * (1 - p)
    const decisivenessScore = 40 + decisiveness * 45
    const calibrationPenalty = Math.min(
      18,
      Math.abs(rawProbability - calibratedProbability) * 0.8
    )
    const confidence = round2(
      clamp(
        0.6 * ruleConfidence +
          0.35 * modelConfidence +
          0.05 * decisivenessScore -
          calibrationPenalty -
          fit.policyPenalty,
        30,
        hasBiz && hasSales && hasStore ? 90 : 82
      )
    )

    if (fit.policyPenalty >= 5) highPolicyPenaltyCount += 1
    if (finalProbability < 20 && confidence >= 85) lowProbHighConfCount += 1

    probabilities.push(finalProbability)
    confidences.push(confidence)
  }

  const comboCount = allKeys.length
  const lowProbHighConfPct =
    comboCount > 0 ? round2((lowProbHighConfCount / comboCount) * 100) : 0
  const highBucketPct =
    comboCount > 0 ? round2((highBucketCount / comboCount) * 100) : 0

  const freshnessMonthsMax = Math.max(
    monthsSince(bizLatestMonth) ?? 0,
    monthsSince(salesLatestMonth) ?? 0,
    monthsSince(storeLatestMonth) ?? 0
  )

  const mojibakeDetectedCount = detectMojibakeCount(
    [...Object.values(INDUSTRY_NAMES), ...Object.values(FACTOR_NAME_MAP)].map(
      (value) => String(value || '')
    )
  )

  const coverageMin = Math.min(bizCoverage, salesCoverage, storeCoverage)
  const pass =
    lowProbHighConfPct <= COMMERCIAL_THRESHOLDS.lowProbHighConfidencePctMax &&
    highBucketPct >= COMMERCIAL_THRESHOLDS.highProbBucketPctMin &&
    highBucketPct <= COMMERCIAL_THRESHOLDS.highProbBucketPctMax &&
    coverageMin >= COMMERCIAL_THRESHOLDS.sigunguCoverageMin &&
    freshnessMonthsMax <= COMMERCIAL_THRESHOLDS.freshnessMonthsMax &&
    mojibakeDetectedCount === 0

  return {
    computed_at: new Date().toISOString(),
    combo_count: comboCount,
    low_prob_high_confidence_count: lowProbHighConfCount,
    low_prob_high_confidence_ratio_pct: lowProbHighConfPct,
    high_prob_bucket_count: highBucketCount,
    high_prob_bucket_pct: highBucketPct,
    sigungu_coverage_business: bizCoverage,
    sigungu_coverage_sales: salesCoverage,
    sigungu_coverage_store: storeCoverage,
    freshness_months_max: freshnessMonthsMax,
    distribution_summary: {
      probability: summarize(probabilities),
      confidence: summarize(confidences),
      buckets: {
        ge_80: highBucketCount,
        lt_20: probabilities.filter((value) => value < 20).length,
      },
    },
    pass,
    details: {
      quality_version: COMMERCIAL_QUALITY_VERSION,
      calibration_version: COMMERCIAL_CALIBRATION_VERSION,
      stale_combo_count: staleComboCount,
      missing_source_count: missingSourceCount,
      high_policy_penalty_count: highPolicyPenaltyCount,
      mojibake_detected_count: mojibakeDetectedCount,
      latest_months: {
        business: bizLatestMonth,
        sales: salesLatestMonth,
        store: storeLatestMonth,
      },
      thresholds: COMMERCIAL_THRESHOLDS,
    },
  }
}

export async function insertCommercialQualitySnapshot(
  snapshot: CommercialQualitySnapshotPayload
) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('commercial_quality_snapshots')
    .insert(snapshot)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function getLatestCommercialQualitySnapshot() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('commercial_quality_snapshots')
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)

  const rows = (data || []) as AnyRow[]
  if (rows.length === 0) return null

  // Prevent stale/mixed calibration writers from overriding gate status.
  const compatible = rows.find((row) => {
    const details =
      row.details && typeof row.details === 'object'
        ? (row.details as AnyRow)
        : null
    if (!details) return false

    const qualityVersion = String(details.quality_version || '').trim()
    const calibrationVersion = String(details.calibration_version || '').trim()
    if (qualityVersion && qualityVersion !== COMMERCIAL_QUALITY_VERSION) {
      return false
    }
    if (
      calibrationVersion &&
      calibrationVersion !== COMMERCIAL_CALIBRATION_VERSION
    ) {
      return false
    }
    return true
  })

  return compatible || rows[0]
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
  const mojibakeDetectedCount = toNumber(
    (snapshot.details as AnyRow | null)?.mojibake_detected_count
  )

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
      details: snapshot.details ?? {},
      thresholds: COMMERCIAL_THRESHOLDS,
    },
  }
}
