'use client'

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Target,
  DollarSign,
  Calendar,
  Lightbulb,
  Award,
} from 'lucide-react'

const API_URL = ''

interface IndustryRecommendation {
  industry_code: string
  industry_name: string
  match_score: number
  expected_monthly_sales: number
  breakeven_months: number
  reasons: string[]
}

interface AnalysisSummary {
  primary_age_group: string
  peak_time: string
  weekend_ratio: number
}

interface IndustryRecommendationResponse {
  district_code: string
  district_name: string
  analyzed_at: string
  recommendations: IndustryRecommendation[]
  analysis_summary?: AnalysisSummary
}

interface IndustryRecommendationProps {
  districtCode: string
}

export function IndustryRecommendation({
  districtCode,
}: IndustryRecommendationProps) {
  const { data, isLoading, error } = useQuery<IndustryRecommendationResponse>({
    queryKey: ['industry-recommendation', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/commercial/districts/${districtCode}/recommend-industry`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch industry recommendations')
      }
      return response.json()
    },
    enabled: !!districtCode,
  })

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/3 rounded bg-gray-200"></div>
          <div className="space-y-4">
            <div className="h-32 rounded bg-gray-200"></div>
            <div className="h-32 rounded bg-gray-200"></div>
            <div className="h-32 rounded bg-gray-200"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-red-600">
          AI 업종 추천 데이터를 불러오는데 실패했습니다.
        </p>
      </div>
    )
  }

  if (!data) return null

  // 매치 점수별 색상
  const getMatchScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 60) return 'text-blue-600 bg-blue-50 border-blue-200'
    if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-gray-600 bg-gray-50 border-gray-200'
  }

  // 매치 점수 라벨
  const getMatchScoreLabel = (score: number) => {
    if (score >= 80) return '매우 적합'
    if (score >= 60) return '적합'
    if (score >= 40) return '보통'
    return '검토 필요'
  }

  // 시간대 라벨
  const getPeakTimeLabel = (time: string) => {
    const timeLabels: Record<string, string> = {
      morning: '오전 (06-11시)',
      lunch: '점심 (11-14시)',
      afternoon: '오후 (14-18시)',
      evening: '저녁 (18-22시)',
      night: '야간 (22-06시)',
    }
    return timeLabels[time] || time
  }

  // 연령대 라벨
  const getAgeGroupLabel = (age: string) => {
    const ageLabels: Record<string, string> = {
      '10s': '10대',
      '20s': '20대',
      '30s': '30대',
      '40s': '40-50대',
      '50s': '50대',
      '60s': '60대 이상',
    }
    return ageLabels[age] || age
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-yellow-500" />
          <h3 className="text-lg font-bold">AI 추천 업종</h3>
        </div>
        <span className="text-xs text-gray-500">
          분석일: {new Date(data.analyzed_at).toLocaleDateString()}
        </span>
      </div>

      {/* 상권 분석 요약 */}
      {data.analysis_summary && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-700">
            상권 특성 분석
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-600">주요 연령층</p>
                <p className="font-semibold text-gray-900">
                  {getAgeGroupLabel(data.analysis_summary.primary_age_group)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-600">피크 시간대</p>
                <p className="font-semibold text-gray-900">
                  {getPeakTimeLabel(data.analysis_summary.peak_time)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-600">주말 비중</p>
                <p className="font-semibold text-gray-900">
                  {(data.analysis_summary.weekend_ratio * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 추천 업종 목록 */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-700">추천 업종 TOP 5</h4>
        {data.recommendations.map((rec, index) => (
          <div
            key={`${rec.industry_code}-${index}`}
            className={`rounded-lg border p-4 ${getMatchScoreColor(rec.match_score)}`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                  <span className="text-lg font-bold text-gray-700">
                    {index + 1}
                  </span>
                </div>
                <div>
                  <h5 className="font-bold text-gray-900">
                    {rec.industry_name}
                  </h5>
                  <p className="text-xs text-gray-600">
                    업종코드: {rec.industry_code}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <Award className="h-4 w-4" />
                  <span className="text-2xl font-bold">{rec.match_score}</span>
                </div>
                <span className="text-xs font-semibold">
                  {getMatchScoreLabel(rec.match_score)}
                </span>
              </div>
            </div>

            {/* 예상 매출 & 손익분기 */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white p-3">
                <div className="mb-1 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-600" />
                  <p className="text-xs text-gray-600">월 예상 매출</p>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {(rec.expected_monthly_sales / 10000).toFixed(0)}만원
                </p>
              </div>
              <div className="rounded-lg bg-white p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-600" />
                  <p className="text-xs text-gray-600">손익분기점</p>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {rec.breakeven_months}개월
                </p>
              </div>
            </div>

            {/* 추천 이유 */}
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                추천 이유
              </p>
              <ul className="space-y-1">
                {rec.reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current"></span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* 면책 조항 */}
      <div className="mt-6 rounded-lg bg-gray-50 p-4">
        <p className="text-xs text-gray-600">
          💡 <strong>참고사항:</strong> 이 추천은 AI 분석 결과이며, 실제 창업
          시에는 점포 위치, 임대료, 경쟁 상황 등 추가적인 요소를 종합적으로
          검토해야 합니다.
        </p>
      </div>
    </div>
  )
}
