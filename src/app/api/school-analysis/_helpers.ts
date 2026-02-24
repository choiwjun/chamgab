import 'server-only'

import crypto from 'crypto'
import type { ApiErrorCode, SchoolAnalysisMode } from '@/types/school-analysis'

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
