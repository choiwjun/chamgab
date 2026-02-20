import type {
  CreateSchoolReportParams,
  SchoolAnalysisReport,
  SchoolDetail,
  SchoolDistrictSummary,
  SchoolPreviewParams,
} from '@/types/school-analysis'

const DEFAULT_TIMEOUT = 10000

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public detail?: string
  ) {
    super(message)
    this.name = 'APIError'
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      ...options,
      cache: options.cache ?? 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timed out.', 408)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, options)

  if (!response.ok) {
    let detail: string | undefined
    try {
      const body = await response.json()
      detail = body?.detail || body?.error
    } catch {
      detail = undefined
    }
    throw new APIError(detail || 'Request failed.', response.status, detail)
  }

  return (await response.json()) as T
}

function toQueryString(params: SchoolPreviewParams): string {
  const query = new URLSearchParams()

  if (params.district_code) query.set('district_code', params.district_code)
  if (typeof params.limit === 'number') query.set('limit', String(params.limit))

  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function getSchoolPreview(
  params: SchoolPreviewParams = {}
): Promise<{ items: SchoolDistrictSummary[]; generated_at: string }> {
  return requestJson(`/api/school-analysis/preview${toQueryString(params)}`)
}

export async function createSchoolReport(
  params: CreateSchoolReportParams
): Promise<{ report: SchoolAnalysisReport; cached: boolean }> {
  return requestJson('/api/school-analysis/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export async function getSchoolReport(
  reportId: string
): Promise<{ report: SchoolAnalysisReport }> {
  return requestJson(
    `/api/school-analysis/reports/${encodeURIComponent(reportId)}`
  )
}

export async function getSchoolDetail(
  schoolId: string
): Promise<{ school: SchoolDetail }> {
  return requestJson(
    `/api/school-analysis/schools/${encodeURIComponent(schoolId)}`
  )
}

export async function createShareToken(
  reportId: string,
  districtCode?: string
): Promise<{ token: string; share_url: string; expires_at: string | null }> {
  return requestJson(
    `/api/school-analysis/reports/${encodeURIComponent(reportId)}/share`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ district_code: districtCode }),
    }
  )
}

export async function getSharedSchoolReport(
  token: string
): Promise<{ report: SchoolAnalysisReport; expires_at: string | null }> {
  return requestJson(`/api/school-analysis/share/${encodeURIComponent(token)}`)
}
