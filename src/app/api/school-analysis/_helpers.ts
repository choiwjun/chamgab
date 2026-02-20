import 'server-only'

import crypto from 'crypto'
import type {
  AcademyEcosystem,
  AvailabilityBlock,
  ConfidenceBreakdown,
  MetricProvenance,
  MetricValue,
  ProgressionStats,
  SchoolAnalysisReport,
  SchoolDetail,
  SchoolDistrictSummary,
  SchoolQualityScore,
  SchoolLevel,
} from '@/types/school-analysis'

const DISTRICT_NAME_MAP: Record<string, string> = {
  '11680': '서울특별시 강남구',
  '11440': '서울특별시 마포구',
  '41135': '경기도 성남시 분당구',
  '28177': '인천광역시 연수구',
  '26440': '부산광역시 해운대구',
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function round(value: number, precision = 1) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function seededValue(seed: string, min: number, max: number, precision = 1) {
  const hash = crypto.createHash('sha256').update(seed).digest()
  const raw = hash.readUInt32BE(0) / 0xffffffff
  const scaled = min + (max - min) * raw
  return round(scaled, precision)
}

function metric(
  value: number | null,
  provenance: MetricProvenance,
  unit = 'score',
  note?: string
): MetricValue {
  const availability: AvailabilityBlock = {
    available: value !== null,
    reason: value === null ? 'missing_source' : 'available',
    note,
  }

  return {
    value,
    unit,
    provenance,
    availability,
    updated_at: new Date().toISOString(),
  }
}

export function normalizeDistrictCode(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return '11680'
  return raw
}

export function districtNameFor(code: string): string {
  return DISTRICT_NAME_MAP[code] || `District ${code}`
}

function buildConfidence(seedKey: string): ConfidenceBreakdown {
  const official = seededValue(`${seedKey}:official`, 72, 95, 1)
  const inferred = seededValue(`${seedKey}:inferred`, 58, 88, 1)
  const total = round(official * 0.7 + inferred * 0.3, 1)

  return {
    official_confidence: official,
    inferred_confidence: inferred,
    total_confidence: total,
    formula_version: 'v1.0.0',
  }
}

function buildSchoolQuality(seedKey: string): SchoolQualityScore {
  const achievement = seededValue(`${seedKey}:achievement`, 65, 96)
  const progressionOutcome = seededValue(`${seedKey}:progression`, 61, 94)
  const environment = seededValue(`${seedKey}:environment`, 60, 92)
  const safetyLife = seededValue(`${seedKey}:safety`, 66, 96)
  const programs = seededValue(`${seedKey}:programs`, 58, 93)

  const overall = round(
    achievement * 0.3 +
      progressionOutcome * 0.25 +
      environment * 0.15 +
      safetyLife * 0.15 +
      programs * 0.15,
    1
  )

  return {
    overall: metric(overall, 'official'),
    achievement: metric(achievement, 'official'),
    progression_outcome: metric(progressionOutcome, 'official'),
    education_environment: metric(environment, 'official'),
    safety_life: metric(safetyLife, 'official'),
    programs: metric(
      programs,
      'inferred',
      'score',
      'Program diversity is inferred from published activity records.'
    ),
  }
}

function buildProgression(seedKey: string): ProgressionStats {
  return {
    general_highschool_rate: metric(
      seededValue(`${seedKey}:progression:general`, 48, 89),
      'official',
      '%'
    ),
    special_purpose_highschool_rate: metric(
      seededValue(`${seedKey}:progression:special`, 3, 19),
      'official',
      '%'
    ),
    autonomy_highschool_rate: metric(
      seededValue(`${seedKey}:progression:autonomy`, 4, 23),
      'official',
      '%'
    ),
    college_progression_rate: metric(
      seededValue(`${seedKey}:progression:college`, 54, 92),
      'inferred',
      '%',
      'College progression for the latest term is partially inferred from historic trend.'
    ),
  }
}

function buildAcademyEcosystem(seedKey: string): AcademyEcosystem {
  const density = seededValue(`${seedKey}:academy:density`, 58, 97)
  const diversity = seededValue(`${seedKey}:academy:diversity`, 54, 95)
  const accessibility = seededValue(`${seedKey}:academy:accessibility`, 56, 96)
  const feeAffordability = seededValue(`${seedKey}:academy:fee`, 43, 85)

  const overall = round(
    density * 0.35 +
      diversity * 0.25 +
      accessibility * 0.2 +
      feeAffordability * 0.2,
    1
  )

  return {
    overall: metric(overall, 'inferred'),
    density: metric(density, 'official'),
    subject_diversity: metric(diversity, 'inferred'),
    accessibility: metric(accessibility, 'inferred'),
    fee_affordability: metric(feeAffordability, 'official'),
  }
}

function normalizeReportId(reportId?: string): string {
  if (reportId && UUID_REGEX.test(reportId)) return reportId
  return crypto.randomUUID()
}

function getShareTokenSecret(): string {
  return (
    process.env.SCHOOL_ANALYSIS_SHARE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'school-analysis-dev-secret'
  )
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function base64urlDecode(input: string): string | null {
  try {
    return Buffer.from(input, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

type PublicShareTokenPayload = {
  v: 'sa1'
  district_code: string
  exp: number
}

export function createPublicShareToken(
  districtCode: string,
  expiresInSeconds = 30 * 24 * 60 * 60
): { token: string; expires_at: string } {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const payload: PublicShareTokenPayload = {
    v: 'sa1',
    district_code: normalizeDistrictCode(districtCode),
    exp,
  }

  const encodedPayload = base64urlEncode(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', getShareTokenSecret())
    .update(encodedPayload)
    .digest('base64url')

  return {
    token: `${encodedPayload}.${signature}`,
    expires_at: new Date(exp * 1000).toISOString(),
  }
}

export function readPublicShareToken(
  token: string
): { district_code: string; expires_at: string } | null {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = crypto
    .createHmac('sha256', getShareTokenSecret())
    .update(encodedPayload)
    .digest('base64url')

  const signatureBuf = Buffer.from(signature)
  const expectedSignatureBuf = Buffer.from(expectedSignature)
  if (signatureBuf.length !== expectedSignatureBuf.length) return null
  if (!crypto.timingSafeEqual(signatureBuf, expectedSignatureBuf)) return null

  const decodedPayload = base64urlDecode(encodedPayload)
  if (!decodedPayload) return null

  let payload: PublicShareTokenPayload
  try {
    payload = JSON.parse(decodedPayload) as PublicShareTokenPayload
  } catch {
    return null
  }

  if (payload.v !== 'sa1') return null
  if (!payload.district_code || typeof payload.district_code !== 'string')
    return null
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp))
    return null
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null

  return {
    district_code: normalizeDistrictCode(payload.district_code),
    expires_at: new Date(payload.exp * 1000).toISOString(),
  }
}

export function buildMockReport(params: {
  reportId?: string
  userId: string | null
  districtCode: string
}): SchoolAnalysisReport {
  const districtCode = normalizeDistrictCode(params.districtCode)
  const districtName = districtNameFor(districtCode)
  const seedKey = `${districtCode}:${params.userId ?? 'public'}`

  const schoolQuality = buildSchoolQuality(seedKey)
  const progression = buildProgression(seedKey)
  const academyEcosystem = buildAcademyEcosystem(seedKey)
  const commuteSafety = metric(
    seededValue(`${seedKey}:commute`, 52, 95),
    'inferred'
  )

  const schoolQualityScore = schoolQuality.overall.value ?? 0
  const academyScore = academyEcosystem.overall.value ?? 0
  const commuteScore = commuteSafety.value ?? 0
  const overall = round(
    schoolQualityScore * 0.45 + academyScore * 0.35 + commuteScore * 0.2,
    1
  )

  const confidence = buildConfidence(seedKey)
  const freshness = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const reportId = normalizeReportId(params.reportId)

  const levels: SchoolLevel[] = ['elementary', 'middle', 'high']
  const schools = levels.map((level, index) => {
    const score = seededValue(`${seedKey}:school:${level}`, 55, 96)
    return {
      school_id: `${districtCode}-${level}-${index + 1}`,
      school_name: `${districtName} ${level.toUpperCase()} ${index + 1}`,
      school_level: level,
      overall_score: metric(score, 'official'),
    }
  })

  return {
    id: reportId,
    user_id: params.userId,
    district_code: districtCode,
    district_name: districtName,
    generated_at: new Date().toISOString(),
    data_freshness: freshness,
    confidence_score: confidence.total_confidence,
    confidence_breakdown: confidence,
    overall_score: metric(overall, 'inferred'),
    school_quality: schoolQuality,
    progression,
    academy_ecosystem: academyEcosystem,
    commute_safety: commuteSafety,
    schools,
  }
}

export function buildMockPreview(params: {
  districtCode?: string
  limit?: number
}): SchoolDistrictSummary[] {
  const allDistrictCodes = Object.keys(DISTRICT_NAME_MAP)
  const requested = params.districtCode
    ? [normalizeDistrictCode(params.districtCode)]
    : allDistrictCodes

  const limit = clamp(params.limit ?? 10, 1, 30)
  const sliced = requested.slice(0, limit)

  return sliced.map((districtCode) => {
    const report = buildMockReport({
      districtCode,
      userId: null,
      reportId: undefined,
    })

    return {
      district_code: districtCode,
      district_name: report.district_name,
      school_count: report.schools.length,
      overall_score: report.overall_score,
      data_freshness: report.data_freshness,
      confidence_score: report.confidence_score,
      confidence_breakdown: report.confidence_breakdown,
    }
  })
}

export function buildMockSchoolDetail(schoolId: string): SchoolDetail {
  const districtCode = schoolId.split('-')[0] || '11680'
  const districtName = districtNameFor(districtCode)
  const seedKey = `school:${schoolId}`

  const schoolLevelToken = schoolId.toLowerCase()
  const schoolLevel: SchoolLevel = schoolLevelToken.includes('middle')
    ? 'middle'
    : schoolLevelToken.includes('high')
      ? 'high'
      : schoolLevelToken.includes('elementary')
        ? 'elementary'
        : 'other'

  const confidence = buildConfidence(seedKey)

  return {
    school_id: schoolId,
    school_name: `School ${schoolId}`,
    school_level: schoolLevel,
    district_code: districtCode,
    district_name: districtName,
    address: `${districtName}, Main-ro ${Math.trunc(seededValue(seedKey, 10, 200, 0))}`,
    location: {
      lat: round(seededValue(`${seedKey}:lat`, 35.0, 37.8), 6),
      lng: round(seededValue(`${seedKey}:lng`, 126.7, 129.2), 6),
    },
    data_freshness: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    confidence_breakdown: confidence,
    quality: buildSchoolQuality(seedKey),
    progression: buildProgression(seedKey),
  }
}

export function createRequestHash(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
}
