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
} from '@/app/api/admin/commercial/quality/_snapshot'

const APARTMENT_THRESHOLDS = {
  factorCoveragePctMin: 98,
  avgFactorCountMin: 9.8,
  avgFactorCountMax: 10.2,
  severeGapPctMax: 20,
  absGapMedianPctMax: 15,
  comparableCoveragePctMin: 95,
} as const

const COMMERCIAL_THRESHOLDS = {
  lowProbHighConfidencePctMax: 3,
  highProbBucketPctMin: 5,
  highProbBucketPctMax: 20,
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

export async function GET(req: NextRequest) {
  if (!hasInternalAdminToken(req)) {
    const gate = await requireAdmin(req)
    if (!gate.ok) return gate.res
  }

  try {
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
      gapAuditSummary,
      autofixSummary,
      latestCommercialSnapshot,
      schoolQualityReport,
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
      readJsonSafe('ml-api/logs/chamgab_gap_audit_summary_latest.json'),
      readJsonSafe('ml-api/logs/chamgab_autofix_summary_latest.json'),
      getLatestCommercialQualitySnapshot(),
      readJsonSafe('ml-api/reports/school_data_quality_latest.json'),
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

    const severeGapCount = toNumber(gapAuditSummary?.severe_abs_gte_25)
    const comparableRows = toNumber(gapAuditSummary?.comparable_rows)
    const severeGapPct = pct(severeGapCount, comparableRows)
    const absGapMedianPct = toNumber(gapAuditSummary?.abs_gap_median_pct)
    const comparableCoveragePct = toNumber(gapAuditSummary?.coverage_pct)
    const unmappableRows = toNumber(
      (autofixSummary?.backfill as Record<string, unknown> | undefined)
        ?.unmappable_rows
    )

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
        source: 'ml-api/logs/chamgab_gap_audit_summary_latest.json',
      }),
      asCheck({
        key: 'abs_gap_median_pct',
        label: 'Median abs gap (%)',
        value: absGapMedianPct,
        target: `<= ${APARTMENT_THRESHOLDS.absGapMedianPctMax}`,
        passWhen: (n) => n <= APARTMENT_THRESHOLDS.absGapMedianPctMax,
        source: 'ml-api/logs/chamgab_gap_audit_summary_latest.json',
      }),
      asCheck({
        key: 'comparable_coverage_pct',
        label: 'Comparable coverage (%)',
        value: comparableCoveragePct,
        target: `>= ${APARTMENT_THRESHOLDS.comparableCoveragePctMin}`,
        passWhen: (n) => n >= APARTMENT_THRESHOLDS.comparableCoveragePctMin,
        source: 'ml-api/logs/chamgab_gap_audit_summary_latest.json',
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

    const schoolChecksData =
      (schoolQualityReport?.checks as Record<string, unknown> | undefined) || {}
    const schoolFreshnessDays = toNumber(
      (
        schoolChecksData.school_freshness_sla as
          | Record<string, unknown>
          | undefined
      )?.value_days
    )
    const academyFreshnessDays = toNumber(
      (
        schoolChecksData.academy_freshness_sla as
          | Record<string, unknown>
          | undefined
      )?.value_days
    )
    const mockFallbackRatePct = toNumber(
      (
        schoolChecksData.mock_fallback_rate as
          | Record<string, unknown>
          | undefined
      )?.value_pct
    )
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
        source: 'ml-api/reports/school_data_quality_latest.json',
      }),
      asCheck({
        key: 'school_freshness_days',
        label: 'School data freshness (days)',
        value: schoolFreshnessDays,
        target: `<= ${SCHOOL_THRESHOLDS.schoolFreshnessDaysMax}`,
        passWhen: (n) => n <= SCHOOL_THRESHOLDS.schoolFreshnessDaysMax,
        source: 'ml-api/reports/school_data_quality_latest.json',
      }),
      asCheck({
        key: 'academy_freshness_days',
        label: 'Academy data freshness (days)',
        value: academyFreshnessDays,
        target: `<= ${SCHOOL_THRESHOLDS.academyFreshnessDaysMax}`,
        passWhen: (n) => n <= SCHOOL_THRESHOLDS.academyFreshnessDaysMax,
        source: 'ml-api/reports/school_data_quality_latest.json',
      }),
    ]

    const landParcelLinkRatePct = pct(
      linkedLandTransactions,
      totalLandTransactions
    )
    const landParcelLocationFillRatePct = pct(
      landParcelsWithLocation,
      totalLandParcels
    )
    const landPricesCoveragePct = pct(landPricesParcels, totalLandParcels)
    const landCharacteristicsCoveragePct = pct(
      landCharacteristicsParcels,
      totalLandParcels
    )
    const cancelledExclusionRatePct = totalLandTransactions > 0 ? 100 : null

    const landChecks: GateCheck[] = [
      asCheck({
        key: 'land_sido_coverage',
        label: 'Land sido coverage',
        value: landSidoCoverage,
        target: `>= ${LAND_THRESHOLDS.sidoCoverageMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.sidoCoverageMin,
        source: 'db:land_transactions.sido',
      }),
      asCheck({
        key: 'land_parcel_link_rate_pct',
        label: 'Transaction parcel link rate (%)',
        value: landParcelLinkRatePct,
        target: `>= ${LAND_THRESHOLDS.parcelLinkRatePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.parcelLinkRatePctMin,
        source: 'db:land_transactions.parcel_id',
      }),
      asCheck({
        key: 'land_parcel_location_fill_rate_pct',
        label: 'Parcel location fill rate (%)',
        value: landParcelLocationFillRatePct,
        target: `>= ${LAND_THRESHOLDS.parcelLocationFillRatePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.parcelLocationFillRatePctMin,
        source: 'db:land_parcels.location',
      }),
      asCheck({
        key: 'land_prices_coverage_pct',
        label: 'Land prices coverage (%)',
        value: landPricesCoveragePct,
        target: `>= ${LAND_THRESHOLDS.landPricesCoveragePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.landPricesCoveragePctMin,
        source: 'db:land_prices.parcel_id',
      }),
      asCheck({
        key: 'land_characteristics_coverage_pct',
        label: 'Land characteristics coverage (%)',
        value: landCharacteristicsCoveragePct,
        target: `>= ${LAND_THRESHOLDS.landCharacteristicsCoveragePctMin}`,
        passWhen: (n) => n >= LAND_THRESHOLDS.landCharacteristicsCoveragePctMin,
        source: 'db:land_characteristics.parcel_id',
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

    const apartmentPass = apartmentChecks.every((c) => c.pass)
    const commercialPass =
      commercialChecks.length > 0 && commercialChecks.every((c) => c.pass)
    const schoolPass = schoolChecks.every((c) => c.pass)
    const landPass = landChecks.every((c) => c.pass)
    const missingMetrics = [
      ...apartmentChecks,
      ...commercialChecks,
      ...schoolChecks,
      ...landChecks,
    ]
      .filter((c) => !c.available)
      .map((c) => c.key)
    const overallPaidReadiness =
      apartmentPass && commercialPass && schoolPass && landPass
        ? 'GO'
        : missingMetrics.length === 0
          ? 'GO_WARN'
          : 'NO_GO'

    return NextResponse.json({
      as_of: new Date().toISOString(),
      status: {
        apartment: apartmentPass ? 'GO' : 'NO_GO',
        commercial: commercialPass ? 'GO' : 'NO_GO',
        school: schoolPass ? 'GO_LIMITED' : 'NO_GO',
        land: landPass ? 'GO_LIMITED' : 'NO_GO',
        overall:
          apartmentPass && commercialPass && schoolPass && landPass
            ? 'GO'
            : 'NO_GO',
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
          sido_coverage: landSidoCoverage,
          prices_distinct_parcels: landPricesParcels,
          characteristics_distinct_parcels: landCharacteristicsParcels,
          parcel_link_rate_pct: landParcelLinkRatePct,
          parcel_location_fill_rate_pct: landParcelLocationFillRatePct,
          land_prices_coverage_pct: landPricesCoveragePct,
          land_characteristics_coverage_pct: landCharacteristicsCoveragePct,
          cancelled_exclusion_rate_pct: cancelledExclusionRatePct,
        },
        thresholds: LAND_THRESHOLDS,
      },
      missing_metrics: missingMetrics,
      note: 'Launch gate is metrics-only. Missing metrics are treated as FAIL until quality jobs publish them.',
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'launch readiness check failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
