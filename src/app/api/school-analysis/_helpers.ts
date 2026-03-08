import 'server-only'

import crypto from 'crypto'
import type {
  ApiErrorCode,
  MetricProvenance,
  MetricValue,
  SchoolAnalysisMode,
  SchoolAnalysisReport,
  SchoolDataStatus,
  SchoolDetail,
  SchoolDistrictSummary,
  SchoolLevel,
  SchoolOverview,
} from '@/types/school-analysis'

export function normalizeDistrictCode(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return '11680'
  return raw
}

export function districtNameFor(code: string): string {
  return `District ${code}`
}

export function createRequestHash(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
}

export function getSchoolAnalysisMode(): SchoolAnalysisMode {
  const raw = (process.env.SCHOOL_ANALYSIS_MODE || '').trim().toLowerCase()
  if (raw === 'open' || raw === 'preview_only') {
    return raw
  }

  const freeOpenMode = (process.env.FREE_OPEN_MODE || '').trim().toLowerCase()
  if (freeOpenMode === 'true') return 'open'

  // Default open to avoid accidental 409 lock when mode env is not set.
  return 'open'
}

export function schoolApiError(
  code: ApiErrorCode,
  message: string,
  status: number
): {
  error: string
  code: ApiErrorCode
  mode: SchoolAnalysisMode
  status: number
} {
  return {
    error: message,
    code,
    mode: getSchoolAnalysisMode(),
    status,
  }
}

const SHARE_TTL_HOURS = 72
const SHARE_SECRET =
  process.env.SCHOOL_SHARE_TOKEN_SECRET ||
  process.env.ML_ADMIN_TOKEN ||
  'school-share-dev-secret'

function toBase64Url(input: Buffer | string): string {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8')
  return raw
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4
  const padded = normalized + (pad === 0 ? '' : '='.repeat(4 - pad))
  return Buffer.from(padded, 'base64')
}

function metric(
  value: number | null,
  provenance: MetricProvenance,
  unit = 'score',
  note?: string
): MetricValue {
  return {
    value,
    unit,
    provenance,
    availability: {
      available: value !== null,
      reason: value !== null ? 'available' : 'missing_source',
      note,
    },
    updated_at: new Date().toISOString(),
  }
}

function normalizeLevel(index: number): SchoolLevel {
  const levels: SchoolLevel[] = ['elementary', 'middle', 'high']
  return levels[index % levels.length] || 'other'
}

function defaultSchools(districtCode: string): SchoolOverview[] {
  const names = ['Central', 'Riverside', 'Skyline']
  return names.map((name, index) => {
    const schoolId = `${districtCode}-${index + 1}`
    const status: SchoolDataStatus[] = ['official', 'official', 'name_mismatch']
    return {
      school_id: schoolId,
      school_name: `${name} School`,
      school_level: normalizeLevel(index),
      overall_score: metric(72 - index * 2, 'inferred'),
      data_status: status[index] || 'official',
    }
  })
}

export function buildMockPreview(params: {
  districtCode?: string
  limit?: number
}): SchoolDistrictSummary[] {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 300)
  const baseCode = normalizeDistrictCode(params.districtCode)

  return Array.from({ length: Math.min(limit, 5) }, (_, index) => {
    const code = params.districtCode
      ? baseCode
      : `${baseCode.slice(0, 4)}${80 + index}`
    const score = 74 - index * 1.5
    const coverage = Math.max(80, 96 - index * 3)
    return {
      district_code: code,
      district_name: districtNameFor(code),
      school_count: 8 + index,
      overall_score: metric(score, 'inferred'),
      data_freshness: new Date().toISOString(),
      confidence_score: Math.max(55, coverage - 10),
      confidence_breakdown: {
        official_confidence: coverage,
        inferred_confidence: 100 - coverage,
        total_confidence: Math.max(55, coverage - 10),
        formula_version: 'v2.0.0',
      },
      quality: {
        official_coverage_pct: coverage,
        inferred_ratio_pct: Math.max(0, 100 - coverage),
        flags: coverage >= 95 ? [] : ['insufficient_official_data'],
      },
      insights: {
        rank: index + 1,
        grade: score >= 85 ? 'S' : score >= 75 ? 'A' : score >= 65 ? 'B' : 'C',
        college_progression_rate: 70 - index * 1.2,
        special_purpose_highschool_rate: 6 + index * 0.4,
        autonomy_highschool_rate: 5 + index * 0.2,
        school_level_breakdown: {
          elementary: 3 + index,
          middle: 2 + index,
          high: 3 + index,
          other: 0,
        },
        academy_count: 120 + index * 12,
        academy_avg_monthly_fee: 280000 + index * 5000,
        college_progression_estimated: true,
        academy_fee_estimated: true,
        academy_fee_reliability: 'ok',
      },
    }
  })
}

export function buildMockReport(params: {
  userId: string | null
  districtCode: string
}): SchoolAnalysisReport {
  const districtCode = normalizeDistrictCode(params.districtCode)
  const schools = defaultSchools(districtCode)
  const generatedAt = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    user_id: params.userId,
    district_code: districtCode,
    district_name: districtNameFor(districtCode),
    generated_at: generatedAt,
    data_freshness: generatedAt,
    confidence_score: 74,
    confidence_breakdown: {
      official_confidence: 88,
      inferred_confidence: 12,
      total_confidence: 74,
      formula_version: 'v2.0.0',
    },
    overall_score: metric(75, 'inferred'),
    school_quality: {
      overall: metric(74, 'official'),
      achievement: metric(73, 'official'),
      progression_outcome: metric(71, 'official'),
      education_environment: metric(76, 'inferred'),
      safety_life: metric(79, 'inferred'),
      programs: metric(68, 'inferred'),
    },
    progression: {
      general_highschool_rate: metric(58, 'inferred', '%'),
      special_purpose_highschool_rate: metric(17, 'inferred', '%'),
      autonomy_highschool_rate: metric(11, 'inferred', '%'),
      college_progression_rate: metric(69, 'inferred', '%'),
    },
    academy_ecosystem: {
      overall: metric(72, 'inferred'),
      density: metric(70, 'official'),
      subject_diversity: metric(68, 'inferred'),
      accessibility: metric(74, 'inferred'),
      fee_affordability: metric(66, 'official'),
    },
    commute_safety: metric(77, 'inferred'),
    schools,
    data_quality: {
      total_schools: schools.length,
      official_count: schools.filter(
        (school) => school.data_status === 'official'
      ).length,
      name_mismatch_count: schools.filter(
        (school) => school.data_status === 'name_mismatch'
      ).length,
      inactive_count: schools.filter(
        (school) => school.data_status === 'inactive'
      ).length,
      coverage_rate: 88,
    },
  }
}

export function buildMockSchoolDetail(schoolId: string): SchoolDetail {
  const districtCode = '11680'
  const report = buildMockReport({ userId: null, districtCode })
  const school = report.schools.find((item) => item.school_id === schoolId)
  const selected = school || report.schools[0]

  return {
    school_id: schoolId,
    school_name: selected.school_name,
    school_level: selected.school_level,
    district_code: districtCode,
    district_name: report.district_name,
    address: `${report.district_name} Sample road 1`,
    location: null,
    data_freshness: report.data_freshness,
    confidence_breakdown: report.confidence_breakdown,
    quality: report.school_quality,
    progression: report.progression,
    data_status: selected.data_status,
    is_active: selected.data_status !== 'inactive',
  }
}

export function createPublicShareToken(districtCode: string): {
  token: string
  expires_at: string
} {
  const expiresAt = new Date(Date.now() + SHARE_TTL_HOURS * 60 * 60 * 1000)
  const payload = {
    district_code: normalizeDistrictCode(districtCode),
    exp: expiresAt.toISOString(),
  }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = toBase64Url(
    crypto.createHmac('sha256', SHARE_SECRET).update(encodedPayload).digest()
  )

  return {
    token: `v1.${encodedPayload}.${signature}`,
    expires_at: expiresAt.toISOString(),
  }
}

export function readPublicShareToken(
  token: string
): { district_code: string; expires_at: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null

  const encodedPayload = parts[1] || ''
  const encodedSignature = parts[2] || ''

  const expectedSignature = toBase64Url(
    crypto.createHmac('sha256', SHARE_SECRET).update(encodedPayload).digest()
  )
  if (expectedSignature !== encodedSignature) return null

  try {
    const payload = JSON.parse(
      fromBase64Url(encodedPayload).toString('utf-8')
    ) as {
      district_code?: string
      exp?: string
    }

    const districtCode = normalizeDistrictCode(payload.district_code)
    const expiresAt = typeof payload.exp === 'string' ? payload.exp : ''
    if (!expiresAt) return null

    const expiresDate = new Date(expiresAt)
    if (!Number.isFinite(expiresDate.getTime())) return null
    if (expiresDate.getTime() <= Date.now()) return null

    return {
      district_code: districtCode,
      expires_at: expiresDate.toISOString(),
    }
  } catch {
    return null
  }
}
