/**
 * 상권분석 클라이언트 API
 */

import type {
  DistrictBasic,
  Industry,
  DistrictDetail,
  BusinessPredictionResult,
  RegionComparisonResult,
  IndustryStatistics,
  BusinessTrends,
  DistrictCharacteristics,
} from '@/types/commercial'

const DEFAULT_TIMEOUT = 10_000
const MAX_RETRIES = 3
const RETRY_DELAY = 1_000

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
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      cache: options.cache ?? 'no-store',
      signal: controller.signal,
    })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('요청 시간이 초과되었습니다.', 408)
    }
    throw error
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  try {
    const response = await fetchWithTimeout(url, options)

    if (response.status === 429 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      return fetchWithRetry(url, options, retries - 1)
    }

    return response
  } catch (error) {
    if (retries > 0 && error instanceof TypeError) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      return fetchWithRetry(url, options, retries - 1)
    }
    throw error
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = '요청 처리에 실패했습니다.'
    let errorDetail: string | undefined

    try {
      const errorData = await response.json()
      errorDetail = errorData.detail || errorData.message
    } catch {
      // ignore parsing error
    }

    switch (response.status) {
      case 400:
        errorMessage = '잘못된 요청입니다.'
        break
      case 401:
        errorMessage = '로그인이 필요합니다.'
        break
      case 403:
        errorMessage = '권한이 없습니다.'
        break
      case 404:
        errorMessage = '요청한 데이터를 찾을 수 없습니다.'
        break
      case 409:
        errorMessage = '현재 상태에서는 요청을 처리할 수 없습니다.'
        break
      case 429:
        errorMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
        break
      case 500:
      case 502:
      case 503:
        errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        break
      default:
        break
    }

    throw new APIError(errorMessage, response.status, errorDetail)
  }

  return response.json()
}

export async function getDistricts(sigunguCode?: string): Promise<DistrictBasic[]> {
  const params = new URLSearchParams()
  if (sigunguCode) params.append('sigungu_code', sigunguCode)

  const url = `/api/commercial/districts${params.toString() ? `?${params}` : ''}`
  const response = await fetchWithRetry(url)
  return handleResponse<DistrictBasic[]>(response)
}

export async function getIndustries(category?: string): Promise<Industry[]> {
  const params = new URLSearchParams()
  if (category) params.append('category', category)

  const url = `/api/commercial/industries${params.toString() ? `?${params}` : ''}`
  const response = await fetchWithRetry(url)
  return handleResponse<Industry[]>(response)
}

export async function getDistrictDetail(
  code: string,
  industryCode?: string
): Promise<DistrictDetail> {
  const qs = industryCode ? `?industry_code=${encodeURIComponent(industryCode)}` : ''
  const response = await fetchWithRetry(`/api/commercial/districts/${code}${qs}`)
  return handleResponse<DistrictDetail>(response)
}

export async function predictBusinessSuccess(params: {
  district_code: string
  industry_code: string
  survival_rate?: number
  monthly_avg_sales?: number
  sales_growth_rate?: number
  store_count?: number
  franchise_ratio?: number
  competition_ratio?: number
}): Promise<BusinessPredictionResult> {
  const queryParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.append(key, value.toString())
    }
  })

  const response = await fetchWithRetry(`/api/commercial/predict?${queryParams.toString()}`, {
    method: 'POST',
  })
  return handleResponse<BusinessPredictionResult>(response)
}

export async function compareRegions(
  districtCodes: string[],
  industryCode: string
): Promise<RegionComparisonResult> {
  const response = await fetchWithRetry('/api/commercial/business/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      district_codes: districtCodes,
      industry_code: industryCode,
    }),
  })
  return handleResponse<RegionComparisonResult>(response)
}

export async function getIndustryStatistics(
  code: string,
  limit = 5
): Promise<IndustryStatistics> {
  const response = await fetchWithRetry(
    `/api/commercial/industries/${code}/statistics?limit=${limit}`
  )
  return handleResponse<IndustryStatistics>(response)
}

export async function getBusinessTrends(
  districtCode: string,
  industryCode: string,
  months = 12
): Promise<BusinessTrends> {
  const response = await fetchWithRetry(
    `/api/commercial/business/trends?district_code=${districtCode}&industry_code=${industryCode}&months=${months}`
  )
  return handleResponse<BusinessTrends>(response)
}

export async function getDistrictCharacteristics(code: string): Promise<DistrictCharacteristics> {
  const response = await fetchWithRetry(`/api/commercial/districts/${code}/characteristics`)
  return handleResponse<DistrictCharacteristics>(response)
}
