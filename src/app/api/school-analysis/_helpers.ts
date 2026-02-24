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
  if (raw === 'open') return 'open'
  return 'preview_only'
}

export function schoolApiError(
  code: ApiErrorCode,
  message: string,
  status: number
): { error: string; code: ApiErrorCode; mode: SchoolAnalysisMode; status: number } {
  return {
    error: message,
    code,
    mode: getSchoolAnalysisMode(),
    status,
  }
}
