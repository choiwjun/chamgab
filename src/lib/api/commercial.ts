/**
 * 상권분석 API 클라이언트
 *
 * 모든 엔드포인트를 로컬 Next.js API 라우트로 호출.
 * HuggingFace ML API 의존성 완전 제거.
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

const DEFAULT_TIMEOUT = 10000 // 10초
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1초

/**
 * 커스텀 에러 클래스
 */
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

/**
 * 타임아웃을 지원하는 fetch wrapper
 */
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

/**
 * 재시도 로직을 포함한 fetch wrapper
 */
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

/**
 * 응답 처리 및 에러 파싱
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = '요청을 처리하는데 실패했습니다.'
    let errorDetail: string | undefined

    try {
      const errorData = await response.json()
      errorDetail = errorData.detail || errorData.message
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }

    switch (response.status) {
      case 400:
        errorMessage = '잘못된 요청입니다.'
        break
      case 404:
        errorMessage = '요청한 데이터를 찾을 수 없습니다.'
        break
      case 429:
        errorMessage =
          '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
        break
      case 500:
      case 502:
      case 503:
        errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        break
    }

    throw new APIError(errorMessage, response.status, errorDetail)
  }

  return response.json()
}

/**
 * 상권 목록 조회
 */
export async function getDistricts(
  sigunguCode?: string
): Promise<DistrictBasic[]> {
  const params = new URLSearchParams()
  if (sigunguCode) params.append('sigungu_code', sigunguCode)

  const url = `/api/commercial/districts${params.toString() ? `?${params}` : ''}`
  const response = await fetchWithRetry(url)
  return handleResponse<DistrictBasic[]>(response)
}

/**
 * 업종 목록 조회
 */
export async function getIndustries(category?: string): Promise<Industry[]> {
  const params = new URLSearchParams()
  if (category) params.append('category', category)

  const url = `/api/commercial/industries${params.toString() ? `?${params}` : ''}`
  const response = await fetchWithRetry(url)
  return handleResponse<Industry[]>(response)
}

/**
 * 상권 상세 정보 조회
 */
export async function getDistrictDetail(
  code: string,
  industryCode?: string
): Promise<DistrictDetail> {
  const qs = industryCode
    ? `?industry_code=${encodeURIComponent(industryCode)}`
    : ''
  const response = await fetchWithRetry(
    `/api/commercial/districts/${code}${qs}`
  )
  return handleResponse<DistrictDetail>(response)
}

/**
 * 창업 성공 확률 예측
 */
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

  const response = await fetchWithRetry(
    `/api/commercial/predict?${queryParams.toString()}`,
    { method: 'POST' }
  )
  return handleResponse<BusinessPredictionResult>(response)
}

/**
 * 지역 비교
 */
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

/**
 * 업종 통계 조회
 */
export async function getIndustryStatistics(
  code: string,
  limit = 5
): Promise<IndustryStatistics> {
  const response = await fetchWithRetry(
    `/api/commercial/industries/${code}/statistics?limit=${limit}`
  )
  return handleResponse<IndustryStatistics>(response)
}

/**
 * 비즈니스 트렌드 조회
 */
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

/**
 * 상권 특성 분석 조회
 */
export async function getDistrictCharacteristics(
  code: string
): Promise<DistrictCharacteristics> {
  const response = await fetchWithRetry(
    `/api/commercial/districts/${code}/characteristics`
  )
  return handleResponse<DistrictCharacteristics>(response)
}
