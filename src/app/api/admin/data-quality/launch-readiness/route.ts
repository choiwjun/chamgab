export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { requireAdmin } from '../../_utils'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  evaluateCommercialSnapshotGate,
  getLatestCommercialQualitySnapshot,
  toCommercialGateStatus,
} from '@/app/api/admin/commercial/quality/_snapshot'

const APARTMENT_THRESHOLDS = {
  factorCoveragePctMin: 98,
  avgFactorCountMin: 9.8,
  avgFactorCountMax: 10.2,
  severeGapPctMax: 20,
  absGapMedianPctMax: 15,
  comparableCoveragePctMin: 95,
} as const

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const COMMERCIAL_THRESHOLDS = {
  lowProbHighConfidencePctMax: 3,
  highProbBucketPctMin: envNumber('COMMERCIAL_HIGH_PROB_BUCKET_PCT_MIN', 1),
  highProbBucketPctMax: envNumber('COMMERCIAL_HIGH_PROB_BUCKET_PCT_MAX', 20),
  sigunguCoverageMin: 227,
  freshnessMonthsMax: 3,
  snapshotAgeHoursMax: 24,
} as const

const SCHOOL_THRESHOLDS = {
  previewDistrictCountMin: 220,
  officialCoveragePctMin: 95,
  inferredRatioPctMax: 20,
  mockFallbackRatePctMax: 0,
  schoolFreshnessDaysMax: 45,
  academyFreshnessDaysMax: 14,
} as const

const LAND_THRESHOLDS = {
  sidoCoverageMin: 17,
  parcelLinkRatePctMin: 95,
  parcelLocationFillRatePctMin: 90,
  landPricesCoveragePctMin: 80,
  landCharacteristicsCoveragePctMin: 80,
  cancelledExclusionRatePctMin: 100,
} as const

const ML_API_BASE_URL = (process.env.ML_API_URL || '').trim()
const ML_API_ADMIN_TOKEN = (
  process.env.ML_ADMIN_TOKEN ||
  process.env.SCHEDULER_ADMIN_TOKEN ||
  process.env.ADMIN_API_TOKEN ||
  ''
).trim()
const LAUNCH_READINESS_FAST_ONLY =
  (process.env.LAUNCH_READINESS_FAST_ONLY || 'true').trim().toLowerCase() !==
  'false'

type GateCheck = {
  key: string
  label: string
  value: number | null
  target: string
  pass: boolean
  available: boolean
  source: string
}

type AdminDbClient = ReturnType<typeof createAdminClient>
type CountQueryResult = {
  count: number | null
  error: { message: string } | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return false
}

function isSourceMissingDomain(
  domain: Record<string, unknown> | null
): boolean {
  if (!domain) return true
  const reason = String(domain.reason || '').toLowerCase()
  if (reason.includes('source_missing') || reason.includes('missing'))
    return true
  const summary = asRecord(domain.summary)
  const summaryReason = String(summary?.reason || '').toLowerCase()
  return (
    summaryReason.includes('source_missing') ||
    summaryReason.includes('missing')
  )
}

function isExecutionUnavailableDomain(
  domain: Record<string, unknown> | null
): boolean {
  if (!domain) return true
  if (domain.execution_ok === false) return true
  const failedChecks = Array.isArray(domain.failed_checks)
    ? (domain.failed_checks as unknown[])
    : []
  const summary = asRecord(domain.summary)
  const hasAnySignal =
    failedChecks.length > 0 ||
    hasMeaningfulValue(domain.metrics) ||
    hasMeaningfulValue(summary)
  return !hasAnySignal
}

function isApartmentPlaceholderFailure(
  domain: Record<string, unknown> | null
): boolean {
  if (!domain) return true
  const metrics = asRecord(domain.metrics)
  if (!metrics) return false

  const comparableRows = toNumber(metrics.comparable_rows)
  const coveragePct = toNumber(metrics.coverage_pct)
  const absGapMedianPct = toNumber(metrics.abs_gap_median_pct)
  const severeRatePct = toNumber(metrics.severe_abs_gte_25_rate_pct)

  return (
    comparableRows === 0 &&
    coveragePct === 0 &&
    absGapMedianPct != null &&
    absGapMedianPct >= 900 &&
    severeRatePct != null &&
    severeRatePct >= 99
  )
}

function statusFromDomainHardFail(
  hardFailValue: unknown,
  domain: Record<string, unknown> | null,
  domainKey: 'apartment' | 'commercial' | 'school' | 'land'
): 'PASS' | 'WARN' | 'FAIL' {
  const base = toGateStatusFromHardFail(hardFailValue)
  if (base !== 'FAIL') return base

  const sourceMissing = isSourceMissingDomain(domain)
  const executionUnavailable = isExecutionUnavailableDomain(domain)
  const placeholderFailure =
    domainKey === 'apartment' && isApartmentPlaceholderFailure(domain)

  if (sourceMissing || executionUnavailable || placeholderFailure) return 'WARN'
  return 'FAIL'
}

function toGateStatusFromHardFail(value: unknown): 'PASS' | 'WARN' | 'FAIL' {
  if (value === true) return 'FAIL'
  if (value === false) return 'PASS'
  return 'WARN'
}

function hasInternalAdminToken(req: NextRequest): boolean {
  const expected =
    process.env.ADMIN_API_TOKEN ||
    process.env.ML_ADMIN_TOKEN ||
    process.env.SCHEDULER_ADMIN_TOKEN ||
    ''
  const provided = req.headers.get('x-admin-token') || ''
  if (!expected || !provided) return false

  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length) return false

  try {
    return timingSafeEqual(expectedBuf, providedBuf)
  } catch {
    return false
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function checkValue(
  checks: Record<string, unknown> | undefined,
  key: string,
  valueKey: string
): number | null {
  const check = checks?.[key] as Record<string, unknown> | undefined
  return toNumber(check?.[valueKey])
}

function pct(
  numerator: number | null,
  denominator: number | null
): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null
  return (numerator / denominator) * 100
}

function monthsSince(yyyymm: string | null): number | null {
  if (!yyyymm || !/^\d{6}$/.test(yyyymm)) return null
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4, 6))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth() + 1
  return (ny - y) * 12 + (nm - m)
}

function asCheck(params: {
  key: string
  label: string
  value: number | null
  target: string
  passWhen: (n: number) => boolean
  source: string
}): GateCheck {
  const available = params.value != null
  return {
    key: params.key,
    label: params.label,
    value: params.value,
    target: params.target,
    pass: available ? params.passWhen(params.value as number) : false,
    available,
    source: params.source,
  }
}

async function readJsonSafe(
  relativePath: string
): Promise<Record<string, unknown> | null> {
  try {
    const abs = path.join(process.cwd(), relativePath)
    const raw = await readFile(abs, 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

async function fetchMlQualityLatest(): Promise<Record<string, unknown> | null> {
  if (!ML_API_BASE_URL || !ML_API_ADMIN_TOKEN) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(
      `${ML_API_BASE_URL.replace(/\/$/, '')}/api/quality/latest`,
      {
        headers: {
          Accept: 'application/json',
          'X-Admin-Token': ML_API_ADMIN_TOKEN,
        },
        cache: 'no-store',
        signal: controller.signal,
      }
    )
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return parsed
}

function daysSince(date: Date | null): number | null {
  if (!date) return null
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs)) return null
  return Number((diffMs / 86_400_000).toFixed(2))
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a.getTime() >= b.getTime() ? a : b
}

function latestIsoTimestamp(values: unknown[]): string {
  let latest: Date | null = null
  for (const value of values) {
    latest = maxDate(latest, parseIsoDate(value))
  }
  return latest?.toISOString() || new Date().toISOString()
}

async function latestTimestampFromTable(
  admin: AdminDbClient,
  params: {
    table: string
    timestampFields: string[]
    excludeSource?: string
  }
): Promise<Date | null> {
  for (const field of params.timestampFields) {
    let query = admin
      .from(params.table)
      .select(field)
      .not(field, 'is', 'null')
      .order(field, { ascending: false })
      .limit(1)

    if (params.excludeSource) {
      query = query.neq('source', params.excludeSource)
    }

    const { data, error } = await query.maybeSingle()
    if (error) continue

    const row = data as unknown
    const rawTimestamp =
      row && typeof row === 'object'
        ? (row as Record<string, unknown>)[field]
        : null
    const candidate = parseIsoDate(rawTimestamp)
    if (candidate) return candidate
  }

  return null
}

async function deriveSchoolFreshnessDays(
  admin: AdminDbClient
): Promise<number | null> {
  const latestRealMetrics = await latestTimestampFromTable(admin, {
    table: 'school_metrics_official',
    timestampFields: ['source_updated_at', 'updated_at'],
    excludeSource: 'seed_official_metrics',
  })
  const latestAnyMetrics =
    latestRealMetrics ??
    (await latestTimestampFromTable(admin, {
      table: 'school_metrics_official',
      timestampFields: ['source_updated_at', 'updated_at'],
    }))
  return daysSince(latestAnyMetrics)
}

async function deriveAcademyFreshnessDays(
  admin: AdminDbClient
): Promise<number | null> {
  const [academyTs, academyFeesTs] = await Promise.all([
    latestTimestampFromTable(admin, {
      table: 'academies',
      timestampFields: ['source_updated_at', 'updated_at'],
    }),
    latestTimestampFromTable(admin, {
      table: 'academy_fees',
      timestampFields: ['source_updated_at', 'updated_at'],
    }),
  ])
  return daysSince(maxDate(academyTs, academyFeesTs))
}

async function countExact(q: PromiseLike<CountQueryResult>): Promise<number> {
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function distinctCount(
  admin: AdminDbClient,
  table: string,
  column: string,
  maxRows = 300_000
): Promise<number> {
  const set = new Set<string>()
  const pageSize = 1000
  let offset = 0

  while (offset < maxRows) {
    const { data, error } = await admin
      .from(table)
      .select(column)
      .not(column, 'is', 'null')
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const row of data as unknown as Record<string, unknown>[]) {
      const v = row[column]
      if (v != null && String(v).trim()) set.add(String(v))
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  return set.size
}

async function averageInferredRatioPreview(
  admin: AdminDbClient
): Promise<number | null> {
  const pageSize = 1000
  let offset = 0
  let sum = 0
  let count = 0
  let supportsInferredRatio = true

  while (offset < 300_000) {
    const selectColumns = supportsInferredRatio
      ? 'inferred_ratio_pct,official_coverage_pct,official_confidence'
      : 'official_coverage_pct,official_confidence'
    const { data, error } = await admin
      .from('vw_school_analysis_preview')
      .select(selectColumns)
      .range(offset, offset + pageSize - 1)

    if (error) {
      if (supportsInferredRatio) {
        supportsInferredRatio = false
        offset = 0
        sum = 0
        count = 0
        continue
      }
      throw new Error(error.message)
    }
    if (!data || data.length === 0) break

    for (const row of data as unknown as Record<string, unknown>[]) {
      const inferredRatio =
        toNumber(row.inferred_ratio_pct) ??
        (() => {
          const official =
            toNumber(row.official_coverage_pct) ??
            toNumber(row.official_confidence)
          return official == null ? null : Math.max(0, 100 - official)
        })()
      if (inferredRatio != null) {
        sum += inferredRatio
        count += 1
      }
    }

    if (data.length < pageSize) break
    offset += pageSize
  }

  if (count === 0) return null
  return Number((sum / count).toFixed(2))
}

async function latestBaseMonth(
  admin: AdminDbClient,
  table: string
): Promise<string | null> {
  const { data, error } = await admin
    .from(table)
    .select('base_year_month')
    .order('base_year_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const value = data?.base_year_month
  return typeof value === 'string' && value.trim() ? value : null
}

function buildSnapshotLaunchReadiness(params: {
  mlQualityPayload: Record<string, unknown> | null
  latestCommercialSnapshot: Record<string, unknown> | null
}): Record<string, unknown> | null {
  const domainSummary =
    (params.mlQualityPayload?.domain_quality_gate_summary as
      | Record<string, unknown>
      | undefined) || null
  const domainMap =
    (domainSummary?.domains as Record<string, unknown> | undefined) || null
  if (!domainMap) return null

  const apartmentDomain =
    (domainMap.apartment as Record<string, unknown> | undefined) || {}
  const commercialDomain =
    (domainMap.commercial as Record<string, unknown> | undefined) || {}
  const schoolDomain =
    (domainMap.school as Record<string, unknown> | undefined) || {}
  const landDomain =
    (domainMap.land as Record<string, unknown> | undefined) || {}

  const apartmentMetrics =
    (apartmentDomain.metrics as Record<string, unknown> | undefined) || {}
  const gapAuditSummary =
    (params.mlQualityPayload?.gap_audit_summary as
      | Record<string, unknown>
      | undefined) || null

  const commercialGate = evaluateCommercialSnapshotGate(
    params.latestCommercialSnapshot
  )
  const commercialChecks: GateCheck[] =
    commercialGate.checks.length > 0
      ? commercialGate.checks.map((check) => ({
          key: check.key,
          label: check.label,
          value: check.value,
          target: check.target,
          pass: check.pass,
          available: check.available,
          source: check.source,
        }))
      : []

  const schoolQuality =
    (params.mlQualityPayload?.school_data_quality as
      | Record<string, unknown>
      | undefined) || null
  const schoolChecksData =
    (schoolQuality?.checks as Record<string, unknown> | undefined) || {}
  const schoolSummary =
    (schoolQuality?.summary as Record<string, unknown> | undefined) || {}

  const schoolPreviewDistrictCount = checkValue(
    schoolChecksData,
    'preview_district_count',
    'value'
  )
  const schoolOfficialCoveragePct = checkValue(
    schoolChecksData,
    'official_coverage_rate',
    'value'
  )
  const schoolInferredRatioPct = checkValue(
    schoolChecksData,
    'inferred_ratio_rate',
    'value'
  )
  const schoolMockFallbackRatePct = checkValue(
    schoolChecksData,
    'mock_fallback_rate',
    'value_pct'
  )
  const schoolFreshnessDays = checkValue(
    schoolChecksData,
    'school_freshness_sla',
    'value_days'
  )
  const academyFreshnessDays = checkValue(
    schoolChecksData,
    'academy_freshness_sla',
    'value_days'
  )

  const schoolChecks: GateCheck[] = [
    asCheck({
      key: 'school_preview_district_count',
      label: 'Preview district row count',
      value: schoolPreviewDistrictCount,
      target: `>= ${SCHOOL_THRESHOLDS.previewDistrictCountMin}`,
      passWhen: (n) => n >= SCHOOL_THRESHOLDS.previewDistrictCountMin,
      source: 'ml-api:/api/quality/latest.school_data_quality',
    }),
    asCheck({
      key: 'school_official_coverage_pct',
      label: 'Official school coverage (%)',
      value: schoolOfficialCoveragePct,
      target: `>= ${SCHOOL_THRESHOLDS.officialCoveragePctMin}`,
      passWhen: (n) => n >= SCHOOL_THRESHOLDS.officialCoveragePctMin,
      source: 'ml-api:/api/quality/latest.school_data_quality',
    }),
    asCheck({
      key: 'school_inferred_ratio_pct',
      label: 'Inferred contribution ratio (%)',
      value: schoolInferredRatioPct,
      target: `<= ${SCHOOL_THRESHOLDS.inferredRatioPctMax}`,
      passWhen: (n) => n <= SCHOOL_THRESHOLDS.inferredRatioPctMax,
      source: 'ml-api:/api/quality/latest.school_data_quality',
    }),
    asCheck({
      key: 'school_mock_fallback_rate_pct',
      label: 'Mock/fallback response rate (%)',
      value: schoolMockFallbackRatePct,
      target: `<= ${SCHOOL_THRESHOLDS.mockFallbackRatePctMax}`,
      passWhen: (n) => n <= SCHOOL_THRESHOLDS.mockFallbackRatePctMax,
      source: 'ml-api:/api/quality/latest.school_data_quality',
    }),
    asCheck({
      key: 'school_freshness_days',
      label: 'School data freshness (days)',
      value: schoolFreshnessDays,
      target: `<= ${SCHOOL_THRESHOLDS.schoolFreshnessDaysMax}`,
      passWhen: (n) => n <= SCHOOL_THRESHOLDS.schoolFreshnessDaysMax,
      source: 'ml-api:/api/quality/latest.school_data_quality',
    }),
    asCheck({
      key: 'academy_freshness_days',
      label: 'Academy data freshness (days)',
      value: academyFreshnessDays,
      target: `<= ${SCHOOL_THRESHOLDS.academyFreshnessDaysMax}`,
      passWhen: (n) => n <= SCHOOL_THRESHOLDS.academyFreshnessDaysMax,
      source: 'ml-api:/api/quality/latest.school_data_quality',
    }),
  ]

  const landQuality =
    (params.mlQualityPayload?.land_collection_status as
      | Record<string, unknown>
      | undefined) || null
  const landChecksData =
    (landQuality?.checks as Record<string, unknown> | undefined) || {}
  const landSummary =
    (landQuality?.summary as Record<string, unknown> | undefined) || {}

  const landSidoCoverageMetric = checkValue(
    landChecksData,
    'land_sido_coverage',
    'value'
  )
  const landParcelLinkRatePct = checkValue(
    landChecksData,
    'land_parcel_link_rate',
    'value_pct'
  )
  const landParcelLocationFillRatePct = checkValue(
    landChecksData,
    'land_parcel_location_fill_rate',
    'value_pct'
  )
  const landPricesCoveragePct = checkValue(
    landChecksData,
    'land_prices_coverage',
    'value_pct'
  )
  const landCharacteristicsCoveragePct = checkValue(
    landChecksData,
    'land_characteristics_coverage',
    'value_pct'
  )
  const cancelledExclusionRatePct =
    toNumber(landSummary.total_transactions) != null ? 100 : null

  const landChecks: GateCheck[] = [
    asCheck({
      key: 'land_sido_coverage',
      label: 'Land sido coverage',
      value: landSidoCoverageMetric,
      target: `>= ${LAND_THRESHOLDS.sidoCoverageMin}`,
      passWhen: (n) => n >= LAND_THRESHOLDS.sidoCoverageMin,
      source: 'ml-api:/api/quality/latest.land_collection_status',
    }),
    asCheck({
      key: 'land_parcel_link_rate_pct',
      label: 'Transaction parcel link rate (%)',
      value: landParcelLinkRatePct,
      target: `>= ${LAND_THRESHOLDS.parcelLinkRatePctMin}`,
      passWhen: (n) => n >= LAND_THRESHOLDS.parcelLinkRatePctMin,
      source: 'ml-api:/api/quality/latest.land_collection_status',
    }),
    asCheck({
      key: 'land_parcel_location_fill_rate_pct',
      label: 'Parcel location fill rate (%)',
      value: landParcelLocationFillRatePct,
      target: `>= ${LAND_THRESHOLDS.parcelLocationFillRatePctMin}`,
      passWhen: (n) => n >= LAND_THRESHOLDS.parcelLocationFillRatePctMin,
      source: 'ml-api:/api/quality/latest.land_collection_status',
    }),
    asCheck({
      key: 'land_prices_coverage_pct',
      label: 'Land prices coverage (%)',
      value: landPricesCoveragePct,
      target: `>= ${LAND_THRESHOLDS.landPricesCoveragePctMin}`,
      passWhen: (n) => n >= LAND_THRESHOLDS.landPricesCoveragePctMin,
      source: 'ml-api:/api/quality/latest.land_collection_status',
    }),
    asCheck({
      key: 'land_characteristics_coverage_pct',
      label: 'Land characteristics coverage (%)',
      value: landCharacteristicsCoveragePct,
      target: `>= ${LAND_THRESHOLDS.landCharacteristicsCoveragePctMin}`,
      passWhen: (n) => n >= LAND_THRESHOLDS.landCharacteristicsCoveragePctMin,
      source: 'ml-api:/api/quality/latest.land_collection_status',
    }),
    asCheck({
      key: 'land_cancelled_exclusion_rate_pct',
      label: 'Cancelled transaction exclusion rate (%)',
      value: cancelledExclusionRatePct,
      target: `>= ${LAND_THRESHOLDS.cancelledExclusionRatePctMin}`,
      passWhen: (n) => n >= LAND_THRESHOLDS.cancelledExclusionRatePctMin,
      source: 'derived:land_collection_status.summary.total_transactions',
    }),
  ]

  const snapshotAsOf = latestIsoTimestamp([
    domainSummary?.generated_at,
    gapAuditSummary?.generated_at,
    schoolQuality?.generated_at,
    landQuality?.generated_at,
    params.latestCommercialSnapshot?.computed_at,
  ])

  const apartmentChecks: GateCheck[] = [
    asCheck({
      key: 'severe_gap_pct',
      label: '|gap| >= 25% ratio',
      value: toNumber(apartmentMetrics.severe_abs_gte_25_rate_pct),
      target: `<= ${APARTMENT_THRESHOLDS.severeGapPctMax}`,
      passWhen: (n) => n <= APARTMENT_THRESHOLDS.severeGapPctMax,
      source: 'ml-api:/api/quality/latest.domain_quality_gate_summary',
    }),
    asCheck({
      key: 'abs_gap_median_pct',
      label: 'Median abs gap (%)',
      value: toNumber(apartmentMetrics.abs_gap_median_pct),
      target: `<= ${APARTMENT_THRESHOLDS.absGapMedianPctMax}`,
      passWhen: (n) => n <= APARTMENT_THRESHOLDS.absGapMedianPctMax,
      source: 'ml-api:/api/quality/latest.domain_quality_gate_summary',
    }),
    asCheck({
      key: 'comparable_coverage_pct',
      label: 'Comparable coverage (%)',
      value: toNumber(apartmentMetrics.coverage_pct),
      target: `>= ${APARTMENT_THRESHOLDS.comparableCoveragePctMin}`,
      passWhen: (n) => n >= APARTMENT_THRESHOLDS.comparableCoveragePctMin,
      source: 'ml-api:/api/quality/latest.domain_quality_gate_summary',
    }),
  ]

  const apartmentGateStatus = statusFromDomainHardFail(
    apartmentDomain.hard_fail,
    apartmentDomain,
    'apartment'
  )
  const commercialFallbackStatus =
    statusFromDomainHardFail(
      commercialDomain.hard_fail,
      commercialDomain,
      'commercial'
    ) === 'WARN'
      ? 'WARN'
      : 'FAIL'
  const commercialGateStatus = toCommercialGateStatus(
    commercialGate.checks,
    commercialFallbackStatus
  )
  const schoolGateStatus = statusFromDomainHardFail(
    schoolDomain.hard_fail,
    schoolDomain,
    'school'
  )
  const landGateStatus = statusFromDomainHardFail(
    landDomain.hard_fail,
    landDomain,
    'land'
  )

  const allDomainsPass =
    apartmentGateStatus === 'PASS' &&
    commercialGateStatus === 'PASS' &&
    schoolGateStatus === 'PASS' &&
    landGateStatus === 'PASS'
  const overallGateStatus: 'PASS' | 'WARN' | 'FAIL' = allDomainsPass
    ? 'PASS'
    : [
          apartmentGateStatus,
          commercialGateStatus,
          schoolGateStatus,
          landGateStatus,
        ].includes('FAIL')
      ? 'FAIL'
      : 'WARN'
  const overallPaidReadiness = allDomainsPass ? 'GO' : 'NO_GO'

  const missingMetrics = [
    ...apartmentChecks,
    ...commercialChecks,
    ...schoolChecks,
    ...landChecks,
  ]
    .filter((c) => !c.available)
    .map((c) => c.key)

  return {
    as_of: snapshotAsOf,
    schema_version: 'launch-readiness-v2-snapshot',
    status: {
      apartment: apartmentGateStatus,
      commercial: commercialGateStatus,
      school: schoolGateStatus,
      land: landGateStatus,
      overall: overallGateStatus,
    },
    overall_paid_readiness: overallPaidReadiness,
    apartment: {
      checks: apartmentChecks,
      metrics: {
        severe_gap_pct: toNumber(apartmentMetrics.severe_abs_gte_25_rate_pct),
        abs_gap_median_pct: toNumber(apartmentMetrics.abs_gap_median_pct),
        comparable_coverage_pct: toNumber(apartmentMetrics.coverage_pct),
        comparable_rows: toNumber(apartmentMetrics.comparable_rows),
      },
      thresholds: APARTMENT_THRESHOLDS,
    },
    commercial: {
      checks: commercialChecks,
      metrics: {
        ...(commercialGate.metrics || {}),
      },
      thresholds: COMMERCIAL_THRESHOLDS,
    },
    school: {
      checks: schoolChecks,
      metrics: {
        preview_district_count: schoolPreviewDistrictCount,
        active_school_count: toNumber(schoolSummary.active_school_count),
        official_school_count: toNumber(schoolSummary.official_school_count),
        official_coverage_pct: schoolOfficialCoveragePct,
        inferred_ratio_pct: schoolInferredRatioPct,
        mock_fallback_rate_pct: schoolMockFallbackRatePct,
        school_freshness_days: schoolFreshnessDays,
        academy_freshness_days: academyFreshnessDays,
      },
      thresholds: SCHOOL_THRESHOLDS,
    },
    land: {
      checks: landChecks,
      metrics: {
        total_transactions: toNumber(landSummary.total_transactions),
        linked_transactions: toNumber(landSummary.linked_transactions),
        cancelled_transactions: toNumber(landSummary.cancelled_transactions),
        total_parcels: toNumber(landSummary.total_parcels),
        parcels_with_location: toNumber(landSummary.parcels_with_location),
        sido_coverage: landSidoCoverageMetric,
        prices_distinct_parcels: toNumber(
          landSummary.land_prices_distinct_parcels
        ),
        characteristics_distinct_parcels: toNumber(
          landSummary.land_characteristics_distinct_parcels
        ),
        parcel_link_rate_pct: landParcelLinkRatePct,
        parcel_location_fill_rate_pct: landParcelLocationFillRatePct,
        land_prices_coverage_pct: landPricesCoveragePct,
        land_characteristics_coverage_pct: landCharacteristicsCoveragePct,
        cancelled_exclusion_rate_pct: cancelledExclusionRatePct,
        quality_report_generated_at:
          (landQuality?.generated_at as string | undefined) || null,
      },
      thresholds: LAND_THRESHOLDS,
    },
    missing_metrics: missingMetrics,
    missing_metrics_count: missingMetrics.length,
    note: 'snapshot-first launch readiness response (ML quality pipeline summary).',
  }
}

function buildFastFallbackLaunchReadiness(params: {
  latestCommercialSnapshot: Record<string, unknown> | null
}): Record<string, unknown> {
  const commercialGate = evaluateCommercialSnapshotGate(
    params.latestCommercialSnapshot
  )
  const commercialStatus: 'PASS' | 'WARN' | 'FAIL' =
    params.latestCommercialSnapshot == null
      ? 'WARN'
      : toCommercialGateStatus(commercialGate.checks, 'FAIL')

  return {
    as_of: new Date().toISOString(),
    schema_version: 'launch-readiness-v2-fast-fallback',
    status: {
      apartment: 'WARN',
      commercial: commercialStatus,
      school: 'WARN',
      land: 'WARN',
      overall: commercialStatus === 'FAIL' ? 'FAIL' : 'WARN',
    },
    overall_paid_readiness: commercialStatus === 'PASS' ? 'GO' : 'NO_GO',
    apartment: {
      checks: [],
      metrics: {},
      thresholds: APARTMENT_THRESHOLDS,
    },
    commercial: {
      checks: commercialGate.checks,
      metrics: commercialGate.metrics,
      thresholds: COMMERCIAL_THRESHOLDS,
    },
    school: {
      checks: [],
      metrics: {},
      thresholds: SCHOOL_THRESHOLDS,
    },
    land: {
      checks: [],
      metrics: {},
      thresholds: LAND_THRESHOLDS,
    },
    missing_metrics: [
      'apartment_checks',
      'school_checks',
      'land_checks',
      'ml_quality_payload',
    ],
    missing_metrics_count: 4,
    note: 'fast fallback response: unavailable domain data is surfaced as WARN to avoid false lockouts.',
  }
}

export async function GET(req: NextRequest) {
  if (!hasInternalAdminToken(req)) {
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.res
  }

  try {
    const [mlQualityPayloadFast, latestCommercialSnapshotFast] =
      await Promise.all([
        fetchMlQualityLatest(),
        getLatestCommercialQualitySnapshot().catch(() => null),
      ])
    const snapshotResponse = buildSnapshotLaunchReadiness({
      mlQualityPayload: mlQualityPayloadFast,
      latestCommercialSnapshot:
        (latestCommercialSnapshotFast as Record<string, unknown> | null) ??
        null,
    })
    if (snapshotResponse) {
      return NextResponse.json(snapshotResponse)
    }

    if (LAUNCH_READINESS_FAST_ONLY) {
      const fastFallback = buildFastFallbackLaunchReadiness({
        latestCommercialSnapshot:
          (latestCommercialSnapshotFast as Record<string, unknown> | null) ??
          null,
      })
      return NextResponse.json(fastFallback, {
        headers: {
          'cache-control': 'no-store',
        },
      })
    }

    const admin = createAdminClient()

    const [
      totalAnalyses,
      totalFactors,
      analysesWithFactors,
      bizSigungu,
      salesSigungu,
      storeSigungu,
      latestBizMonth,
      latestSalesMonth,
      latestStoreMonth,
      previewDistrictCount,
      activeSchoolCount,
      officialSchoolCount,
      avgInferredRatioPct,
      mlQualityPayload,
      gapAuditSummary,
      autofixSummary,
      latestCommercialSnapshot,
      schoolQualityReport,
      derivedSchoolFreshnessDays,
      derivedAcademyFreshnessDays,
      landQualityReport,
      totalLandTransactions,
      linkedLandTransactions,
      cancelledLandTransactions,
      totalLandParcels,
      landParcelsWithLocation,
      landSidoCoverage,
      landPricesParcels,
      landCharacteristicsParcels,
    ] = await Promise.all([
      countExact(
        admin
          .from('chamgab_analyses')
          .select('id', { count: 'exact', head: true })
      ),
      countExact(
        admin.from('price_factors').select('id', { count: 'exact', head: true })
      ),
      distinctCount(admin, 'price_factors', 'analysis_id'),
      distinctCount(admin, 'business_statistics', 'sigungu_code'),
      distinctCount(admin, 'sales_statistics', 'sigungu_code'),
      distinctCount(admin, 'store_statistics', 'sigungu_code'),
      latestBaseMonth(admin, 'business_statistics'),
      latestBaseMonth(admin, 'sales_statistics'),
      latestBaseMonth(admin, 'store_statistics'),
      countExact(
        admin
          .from('vw_school_analysis_preview')
          .select('district_code', { count: 'exact', head: true })
      ),
      countExact(
        admin
          .from('schools')
          .select('school_id', { count: 'exact', head: true })
          .eq('is_active', true)
      ),
      countExact(
        admin
          .from('vw_school_quality_latest')
          .select('school_id', { count: 'exact', head: true })
          .not('achievement_score', 'is', 'null')
      ),
      averageInferredRatioPreview(admin),
      fetchMlQualityLatest(),
      readJsonSafe('ml-api/logs/chamgab_gap_audit_summary_latest.json'),
      readJsonSafe('ml-api/logs/chamgab_autofix_summary_latest.json'),
      getLatestCommercialQualitySnapshot(),
      readJsonSafe('ml-api/reports/school_data_quality_latest.json'),
      deriveSchoolFreshnessDays(admin),
      deriveAcademyFreshnessDays(admin),
      readJsonSafe('ml-api/reports/land_collection_status_latest.json'),
      countExact(
        admin
          .from('land_transactions')
          .select('id', { count: 'exact', head: true })
      ),
      countExact(
        admin
          .from('land_transactions')
          .select('id', { count: 'exact', head: true })
          .not('parcel_id', 'is', 'null')
      ),
      countExact(
        admin
          .from('land_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('is_cancelled', true)
      ),
      countExact(
        admin.from('land_parcels').select('id', { count: 'exact', head: true })
      ),
      countExact(
        admin
          .from('land_parcels')
          .select('id', { count: 'exact', head: true })
          .not('location', 'is', 'null')
      ),
      distinctCount(admin, 'land_transactions', 'sido'),
      distinctCount(admin, 'land_prices', 'parcel_id'),
      distinctCount(admin, 'land_characteristics', 'parcel_id'),
    ])

    const factorCoveragePct = pct(analysesWithFactors, totalAnalyses)
    const avgFactorCount =
      totalAnalyses > 0
        ? Number((totalFactors / totalAnalyses).toFixed(2))
        : null

    const externalGapAuditSummary =
      (mlQualityPayload?.gap_audit_summary as
        | Record<string, unknown>
        | undefined) || null
    const externalDomainQualitySummary =
      (mlQualityPayload?.domain_quality_gate_summary as
        | Record<string, unknown>
        | undefined) || null
    const apartmentGateMetrics =
      ((
        (
          externalDomainQualitySummary?.domains as
            | Record<string, unknown>
            | undefined
        )?.apartment as Record<string, unknown> | undefined
      )?.metrics as Record<string, unknown> | undefined) || null

    const effectiveGapAuditSummary = gapAuditSummary || externalGapAuditSummary

    const severeGapCount = toNumber(effectiveGapAuditSummary?.severe_abs_gte_25)
    const comparableRows = toNumber(effectiveGapAuditSummary?.comparable_rows)
    const severeGapPct =
      pct(severeGapCount, comparableRows) ??
      toNumber(apartmentGateMetrics?.severe_abs_gte_25_rate_pct)
    const absGapMedianPct =
      toNumber(effectiveGapAuditSummary?.abs_gap_median_pct) ??
      toNumber(apartmentGateMetrics?.abs_gap_median_pct)
    const comparableCoveragePct =
      toNumber(effectiveGapAuditSummary?.coverage_pct) ??
      toNumber(apartmentGateMetrics?.coverage_pct)
    const unmappableRows = toNumber(
      (autofixSummary?.backfill as Record<string, unknown> | undefined)
        ?.unmappable_rows
    )
    const apartmentGapMetricSource = gapAuditSummary
      ? 'ml-api/logs/chamgab_gap_audit_summary_latest.json'
      : externalGapAuditSummary
        ? 'ml-api:/api/quality/latest.gap_audit_summary'
        : apartmentGateMetrics
          ? 'ml-api:/api/quality/latest.domain_quality_gate_summary.domains.apartment.metrics'
          : 'unavailable'

    const apartmentChecks: GateCheck[] = [
      asCheck({
        key: 'factor_coverage',
        label: 'Factor coverage (%)',
        value: factorCoveragePct,
        target: `>= ${APARTMENT_THRESHOLDS.factorCoveragePctMin}`,
        passWhen: (n) => n >= APARTMENT_THRESHOLDS.factorCoveragePctMin,
        source: 'db:chamgab_analyses+price_factors',
      }),
      asCheck({
        key: 'avg_factor_count',
        label: 'Avg factors per analysis',
        value: avgFactorCount,
        target: `${APARTMENT_THRESHOLDS.avgFactorCountMin} ~ ${APARTMENT_THRESHOLDS.avgFactorCountMax}`,
        passWhen: (n) =>
          n >= APARTMENT_THRESHOLDS.avgFactorCountMin &&
          n <= APARTMENT_THRESHOLDS.avgFactorCountMax,
        source: 'db:chamgab_analyses+price_factors',
      }),
      asCheck({
        key: 'severe_gap_pct',
        label: '|gap| >= 25% ratio',
        value: severeGapPct,
        target: `<= ${APARTMENT_THRESHOLDS.severeGapPctMax}`,
        passWhen: (n) => n <= APARTMENT_THRESHOLDS.severeGapPctMax,
        source: apartmentGapMetricSource,
      }),
      asCheck({
        key: 'abs_gap_median_pct',
        label: 'Median abs gap (%)',
        value: absGapMedianPct,
        target: `<= ${APARTMENT_THRESHOLDS.absGapMedianPctMax}`,
        passWhen: (n) => n <= APARTMENT_THRESHOLDS.absGapMedianPctMax,
        source: apartmentGapMetricSource,
      }),
      asCheck({
        key: 'comparable_coverage_pct',
        label: 'Comparable coverage (%)',
        value: comparableCoveragePct,
        target: `>= ${APARTMENT_THRESHOLDS.comparableCoveragePctMin}`,
        passWhen: (n) => n >= APARTMENT_THRESHOLDS.comparableCoveragePctMin,
        source: apartmentGapMetricSource,
      }),
    ]

    const staleBizMonths = monthsSince(latestBizMonth)
    const staleSalesMonths = monthsSince(latestSalesMonth)
    const staleStoreMonths = monthsSince(latestStoreMonth)
    const freshnessMonths = [staleBizMonths, staleSalesMonths, staleStoreMonths]
      .filter((v): v is number => v != null)
      .reduce((max, n) => (n > max ? n : max), 0)

    const commercialGate = evaluateCommercialSnapshotGate(
      latestCommercialSnapshot as Record<string, unknown> | null
    )
    const commercialChecks: GateCheck[] = commercialGate.checks.map(
      (check) => ({
        key: check.key,
        label: check.label,
        value: check.value,
        target: check.target,
        pass: check.pass,
        available: check.available,
        source: check.source,
      })
    )

    const externalSchoolQualityReport =
      (mlQualityPayload?.school_data_quality as
        | Record<string, unknown>
        | undefined) || null
    const effectiveSchoolQualityReport =
      schoolQualityReport || externalSchoolQualityReport
    const schoolChecksData =
      (effectiveSchoolQualityReport?.checks as
        | Record<string, unknown>
        | undefined) || {}
    const reportSchoolFreshnessDays = toNumber(
      (
        schoolChecksData.school_freshness_sla as
          | Record<string, unknown>
          | undefined
      )?.value_days
    )
    const reportAcademyFreshnessDays = toNumber(
      (
        schoolChecksData.academy_freshness_sla as
          | Record<string, unknown>
          | undefined
      )?.value_days
    )
    const reportMockFallbackRatePct = toNumber(
      (
        schoolChecksData.mock_fallback_rate as
          | Record<string, unknown>
          | undefined
      )?.value_pct
    )
    const schoolFreshnessDays =
      reportSchoolFreshnessDays ?? derivedSchoolFreshnessDays
    const academyFreshnessDays =
      reportAcademyFreshnessDays ?? derivedAcademyFreshnessDays
    const mockFallbackRatePct = reportMockFallbackRatePct ?? 0

    const schoolQualityReportSource = schoolQualityReport
      ? 'ml-api/reports/school_data_quality_latest.json'
      : externalSchoolQualityReport
        ? 'ml-api:/api/quality/latest.school_data_quality'
        : null
    const schoolMockFallbackSource =
      reportMockFallbackRatePct != null
        ? schoolQualityReportSource || 'unavailable'
        : 'derived:check_school_data_quality.default_mock_fallback_rate(0)'
    const schoolFreshnessSource =
      reportSchoolFreshnessDays != null
        ? schoolQualityReportSource || 'unavailable'
        : 'db:school_metrics_official.source_updated_at|updated_at'
    const academyFreshnessSource =
      reportAcademyFreshnessDays != null
        ? schoolQualityReportSource || 'unavailable'
        : 'db:academies+academy_fees.source_updated_at|updated_at'

    const officialCoveragePct = pct(officialSchoolCount, activeSchoolCount)

    const schoolChecks: GateCheck[] = [
      asCheck({
        key: 'school_preview_district_count',
        label: 'Preview district row count',
        value: previewDistrictCount,
        target: `>= ${SCHOOL_THRESHOLDS.previewDistrictCountMin}`,
        passWhen: (n) => n >= SCHOOL_THRESHOLDS.previewDistrictCountMin,
        source: 'db:vw_school_analysis_preview',
      }),
      asCheck({
        key: 'school_official_coverage_pct',
        label: 'Official school coverage (%)',
        value: officialCoveragePct,
        target: `>= ${SCHOOL_THRESHOLDS.officialCoveragePctMin}`,
        passWhen: (n) => n >= SCHOOL_THRESHOLDS.officialCoveragePctMin,
        source: 'db:schools+vw_school_quality_latest',
      }),
      asCheck({
        key: 'school_inferred_ratio_pct',
        label: 'Inferred contribution ratio (%)',
        value: avgInferredRatioPct,
        target: `<= ${SCHOOL_THRESHOLDS.inferredRatioPctMax}`,
        passWhen: (n) => n <= SCHOOL_THRESHOLDS.inferredRatioPctMax,
        source: 'db:vw_school_analysis_preview',
      }),
      asCheck({
        key: 'school_mock_fallback_rate_pct',
        label: 'Mock/fallback response rate (%)',
        value: mockFallbackRatePct,
        target: `<= ${SCHOOL_THRESHOLDS.mockFallbackRatePctMax}`,
        passWhen: (n) => n <= SCHOOL_THRESHOLDS.mockFallbackRatePctMax,
        source: schoolMockFallbackSource,
      }),
      asCheck({
        key: 'school_freshness_days',
        label: 'School data freshness (days)',
        value: schoolFreshnessDays,
        target: `<= ${SCHOOL_THRESHOLDS.schoolFreshnessDaysMax}`,
        passWhen: (n) => n <= SCHOOL_THRESHOLDS.schoolFreshnessDaysMax,
        source: schoolFreshnessSource,
      }),
      asCheck({
        key: 'academy_freshness_days',
        label: 'Academy data freshness (days)',
        value: academyFreshnessDays,
        target: `<= ${SCHOOL_THRESHOLDS.academyFreshnessDaysMax}`,
        passWhen: (n) => n <= SCHOOL_THRESHOLDS.academyFreshnessDaysMax,
        source: academyFreshnessSource,
      }),
    ]

    const landChecksData =
      (landQualityReport?.checks as Record<string, unknown> | undefined) || {}
    const reportLandSidoCoverage = checkValue(
      landChecksData,
      'land_sido_coverage',
      'value'
    )
    const reportLandParcelLinkRatePct = checkValue(
      landChecksData,
      'land_parcel_link_rate',
      'value_pct'
    )
    const reportLandParcelLocationFillRatePct = checkValue(
      landChecksData,
      'land_parcel_location_fill_rate',
      'value_pct'
    )
    const reportLandPricesCoveragePct = checkValue(
      landChecksData,
      'land_prices_coverage',
      'value_pct'
    )
    const reportLandCharacteristicsCoveragePct = checkValue(
      landChecksData,
      'land_characteristics_coverage',
      'value_pct'
    )
    const landQualityGeneratedAt =
      typeof landQualityReport?.generated_at === 'string'
        ? landQualityReport.generated_at
        : null

    const landSidoCoverageMetric = reportLandSidoCoverage ?? landSidoCoverage
    const landParcelLinkRatePct =
      reportLandParcelLinkRatePct ??
      pct(linkedLandTransactions, totalLandTransactions)
    const landParcelLocationFillRatePct =
      reportLandParcelLocationFillRatePct ??
      pct(landParcelsWithLocation, totalLandParcels)
    const landPricesCoveragePct =
      reportLandPricesCoveragePct ?? pct(landPricesParcels, totalLandParcels)
    const landCharacteristicsCoveragePct =
      reportLandCharacteristicsCoveragePct ??
      pct(landCharacteristicsParcels, totalLandParcels)
    const cancelledExclusionRatePct = totalLandTransactions > 0 ? 100 : null

    const landSidoCoverageSource =
      reportLandSidoCoverage != null
        ? 'ml-api/reports/land_collection_status_latest.json'
        : 'db:land_transactions.sido'
    const landParcelLinkRateSource =
      reportLandParcelLinkRatePct != null
        ? 'ml-api/reports/land_collection_status_latest.json'
        : 'db:land_transactions.parcel_id'
    const landParcelLocationFillRateSource =
      reportLandParcelLocationFillRatePct != null
        ? 'ml-api/reports/land_collection_status_latest.json'
        : 'db:land_parcels.location'
    const landPricesCoverageSource =
      reportLandPricesCoveragePct != null
        ? 'ml-api/reports/land_collection_status_latest.json'
        : 'db:land_prices.parcel_id'
    const landCharacteristicsCoverageSource =
      reportLandCharacteristicsCoveragePct != null
        ? 'ml-api/reports/land_collection_status_latest.json'
        : 'db:land_characteristics.parcel_id'

    const landChecks: GateCheck[] = [
      asCheck({
        key: 'land_sido_coverage',
        label: 'Land sido coverage',
        value: landSidoCoverageMetric,
        target: `>= ${LAND_THRESHOLDS.sidoCoverageMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.sidoCoverageMin,
        source: landSidoCoverageSource,
      }),
      asCheck({
        key: 'land_parcel_link_rate_pct',
        label: 'Transaction parcel link rate (%)',
        value: landParcelLinkRatePct,
        target: `>= ${LAND_THRESHOLDS.parcelLinkRatePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.parcelLinkRatePctMin,
        source: landParcelLinkRateSource,
      }),
      asCheck({
        key: 'land_parcel_location_fill_rate_pct',
        label: 'Parcel location fill rate (%)',
        value: landParcelLocationFillRatePct,
        target: `>= ${LAND_THRESHOLDS.parcelLocationFillRatePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.parcelLocationFillRatePctMin,
        source: landParcelLocationFillRateSource,
      }),
      asCheck({
        key: 'land_prices_coverage_pct',
        label: 'Land prices coverage (%)',
        value: landPricesCoveragePct,
        target: `>= ${LAND_THRESHOLDS.landPricesCoveragePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.landPricesCoveragePctMin,
        source: landPricesCoverageSource,
      }),
      asCheck({
        key: 'land_characteristics_coverage_pct',
        label: 'Land characteristics coverage (%)',
        value: landCharacteristicsCoveragePct,
        target: `>= ${LAND_THRESHOLDS.landCharacteristicsCoveragePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.landCharacteristicsCoveragePctMin,
        source: landCharacteristicsCoverageSource,
      }),
      asCheck({
        key: 'land_cancelled_exclusion_rate_pct',
        label: 'Cancelled transaction exclusion rate (%)',
        value: cancelledExclusionRatePct,
        target: `>= ${LAND_THRESHOLDS.cancelledExclusionRatePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.cancelledExclusionRatePctMin,
        source: 'api:/api/land/analysis enforces is_cancelled=false',
      }),
    ]

    const missingMetrics = [
      ...apartmentChecks,
      ...commercialChecks,
      ...schoolChecks,
      ...landChecks,
    ]
      .filter((c) => !c.available)
      .map((c) => c.key)
    const toDomainGateStatus = (
      checks: GateCheck[]
    ): 'PASS' | 'WARN' | 'FAIL' => {
      if (checks.length > 0 && checks.every((check) => check.pass))
        return 'PASS'
      if (checks.some((check) => !check.available)) return 'WARN'
      return 'FAIL'
    }

    const apartmentGateStatus = toDomainGateStatus(apartmentChecks)
    const commercialGateStatus = toCommercialGateStatus(
      commercialGate.checks,
      toDomainGateStatus(commercialChecks) === 'WARN' ? 'WARN' : 'FAIL'
    )
    const schoolGateStatus = toDomainGateStatus(schoolChecks)
    const landGateStatus = toDomainGateStatus(landChecks)
    const allDomainsPass =
      apartmentGateStatus === 'PASS' &&
      commercialGateStatus === 'PASS' &&
      schoolGateStatus === 'PASS' &&
      landGateStatus === 'PASS'
    const overallGateStatus: 'PASS' | 'WARN' | 'FAIL' = allDomainsPass
      ? 'PASS'
      : [
            apartmentGateStatus,
            commercialGateStatus,
            schoolGateStatus,
            landGateStatus,
          ].includes('FAIL')
        ? 'FAIL'
        : 'WARN'
    const overallPaidReadiness = allDomainsPass ? 'GO' : 'NO_GO'

    return NextResponse.json({
      as_of: new Date().toISOString(),
      schema_version: 'launch-readiness-v2',
      status: {
        apartment: apartmentGateStatus,
        commercial: commercialGateStatus,
        school: schoolGateStatus,
        land: landGateStatus,
        overall: overallGateStatus,
      },
      overall_paid_readiness: overallPaidReadiness,
      apartment: {
        checks: apartmentChecks,
        metrics: {
          total_analyses: totalAnalyses,
          total_factors: totalFactors,
          analyses_with_factors: analysesWithFactors,
          factor_coverage_pct: factorCoveragePct,
          avg_factor_count: avgFactorCount,
          severe_gap_pct: severeGapPct,
          abs_gap_median_pct: absGapMedianPct,
          comparable_coverage_pct: comparableCoveragePct,
          unmappable_rows: unmappableRows,
        },
        thresholds: APARTMENT_THRESHOLDS,
      },
      commercial: {
        checks: commercialChecks,
        metrics: {
          ...(commercialGate.metrics || {}),
          latest_base_year_month: {
            business_statistics: latestBizMonth,
            sales_statistics: latestSalesMonth,
            store_statistics: latestStoreMonth,
          },
          freshness_months: {
            business_statistics: staleBizMonths,
            sales_statistics: staleSalesMonths,
            store_statistics: staleStoreMonths,
            max: Number.isFinite(freshnessMonths) ? freshnessMonths : null,
          },
          sigungu_coverage_by_table: {
            business_statistics: bizSigungu,
            sales_statistics: salesSigungu,
            store_statistics: storeSigungu,
          },
        },
        thresholds: COMMERCIAL_THRESHOLDS,
      },
      school: {
        checks: schoolChecks,
        metrics: {
          preview_district_count: previewDistrictCount,
          active_school_count: activeSchoolCount,
          official_school_count: officialSchoolCount,
          official_coverage_pct: officialCoveragePct,
          inferred_ratio_pct: avgInferredRatioPct,
          mock_fallback_rate_pct: mockFallbackRatePct,
          school_freshness_days: schoolFreshnessDays,
          academy_freshness_days: academyFreshnessDays,
        },
        thresholds: SCHOOL_THRESHOLDS,
      },
      land: {
        checks: landChecks,
        metrics: {
          total_transactions: totalLandTransactions,
          linked_transactions: linkedLandTransactions,
          cancelled_transactions: cancelledLandTransactions,
          total_parcels: totalLandParcels,
          parcels_with_location: landParcelsWithLocation,
          sido_coverage: landSidoCoverageMetric,
          prices_distinct_parcels: landPricesParcels,
          characteristics_distinct_parcels: landCharacteristicsParcels,
          parcel_link_rate_pct: landParcelLinkRatePct,
          parcel_location_fill_rate_pct: landParcelLocationFillRatePct,
          land_prices_coverage_pct: landPricesCoveragePct,
          land_characteristics_coverage_pct: landCharacteristicsCoveragePct,
          cancelled_exclusion_rate_pct: cancelledExclusionRatePct,
          quality_report_generated_at: landQualityGeneratedAt,
        },
        thresholds: LAND_THRESHOLDS,
      },
      missing_metrics: missingMetrics,
      missing_metrics_count: missingMetrics.length,
      note: 'overall_paid_readiness uses strict policy: all PASS => GO, otherwise NO_GO.',
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'launch readiness check failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
