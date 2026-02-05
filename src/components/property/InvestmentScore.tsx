'use client'

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Home,
  BarChart3,
} from 'lucide-react'

interface ROIData {
  period: string
  roi_percent: number
  profit: number
  rating: string
}

interface JeonsegaRatioTrend {
  current_ratio: number
  trend: string
  change_percent: number
}

interface LiquidityScore {
  score: number
  level: string
  transaction_count_3months: number
  days_on_market_avg: number
}

interface InvestmentRecommendation {
  recommended: boolean
  reason: string
  key_factors: string[]
}

interface InvestmentScoreData {
  property_id: string
  investment_score: number
  roi_1year: ROIData
  roi_3year: ROIData
  jeonse_ratio: JeonsegaRatioTrend
  liquidity: LiquidityScore
  recommendation: InvestmentRecommendation
  analyzed_at: string
}

interface InvestmentScoreProps {
  propertyId: string
}

export function InvestmentScore({ propertyId }: InvestmentScoreProps) {
  const { data, isLoading, error } = useQuery<InvestmentScoreData>({
    queryKey: ['investment-score', propertyId],
    queryFn: async () => {
      const response = await fetch(
        `http://localhost:8002/api/chamgab/${propertyId}/investment-score`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch investment score')
      }
      return response.json()
    },
    enabled: !!propertyId,
  })

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/3 rounded bg-gray-200"></div>
          <div className="h-64 rounded bg-gray-200"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-red-600">투자 점수를 불러오는데 실패했습니다.</p>
      </div>
    )
  }

  if (!data) return null

  // 점수별 색상
  const scoreColor =
    data.investment_score >= 70
      ? 'green'
      : data.investment_score >= 50
        ? 'yellow'
        : 'red'

  // ROI 등급별 색상
  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'excellent':
        return 'text-green-600 bg-green-50'
      case 'good':
        return 'text-blue-600 bg-blue-50'
      case 'fair':
        return 'text-yellow-600 bg-yellow-50'
      case 'poor':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  // ROI 등급별 라벨
  const getRatingLabel = (rating: string) => {
    switch (rating) {
      case 'excellent':
        return '우수'
      case 'good':
        return '양호'
      case 'fair':
        return '보통'
      case 'poor':
        return '부진'
      default:
        return '알 수 없음'
    }
  }

  // 유동성 레벨별 색상
  const getLiquidityColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-green-600 bg-green-50'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50'
      case 'low':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  // 유동성 레벨별 라벨
  const getLiquidityLabel = (level: string) => {
    switch (level) {
      case 'high':
        return '높음'
      case 'medium':
        return '보통'
      case 'low':
        return '낮음'
      default:
        return '알 수 없음'
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-bold">투자 점수 분석</h3>
        <span className="text-xs text-gray-500">
          분석일: {new Date(data.analyzed_at).toLocaleDateString()}
        </span>
      </div>

      {/* 종합 투자 점수 */}
      <div
        className={`mb-8 rounded-lg border p-6 ${
          scoreColor === 'green'
            ? 'border-green-200 bg-green-50'
            : scoreColor === 'yellow'
              ? 'border-yellow-200 bg-yellow-50'
              : 'border-red-200 bg-red-50'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h4
            className={`text-sm font-semibold ${
              scoreColor === 'green'
                ? 'text-green-900'
                : scoreColor === 'yellow'
                  ? 'text-yellow-900'
                  : 'text-red-900'
            }`}
          >
            종합 투자 점수
          </h4>
          <BarChart3
            className={`h-5 w-5 ${
              scoreColor === 'green'
                ? 'text-green-600'
                : scoreColor === 'yellow'
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          />
        </div>

        <div className="flex items-end gap-2">
          <p
            className={`text-5xl font-bold ${
              scoreColor === 'green'
                ? 'text-green-900'
                : scoreColor === 'yellow'
                  ? 'text-yellow-900'
                  : 'text-red-900'
            }`}
          >
            {data.investment_score}
          </p>
          <span className="mb-2 text-gray-600">/100</span>
        </div>

        <div className="mt-4 h-4 rounded-full bg-gray-200">
          <div
            className={`h-4 rounded-full ${
              scoreColor === 'green'
                ? 'bg-green-500'
                : scoreColor === 'yellow'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${data.investment_score}%` }}
          ></div>
        </div>
      </div>

      {/* ROI 분석 */}
      <div className="mb-8">
        <h4 className="mb-4 font-semibold">📈 수익률 (ROI)</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 1년 ROI */}
          <div
            className={`rounded-lg border p-4 ${getRatingColor(data.roi_1year.rating)}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">1년</p>
              <span className="rounded px-2 py-1 text-xs font-semibold">
                {getRatingLabel(data.roi_1year.rating)}
              </span>
            </div>
            <p className="text-2xl font-bold">
              {data.roi_1year.roi_percent > 0 ? '+' : ''}
              {data.roi_1year.roi_percent.toFixed(1)}%
            </p>
            <p className="mt-1 text-sm">
              예상 수익: {(data.roi_1year.profit / 10000).toFixed(0)}만원
            </p>
          </div>

          {/* 3년 ROI */}
          <div
            className={`rounded-lg border p-4 ${getRatingColor(data.roi_3year.rating)}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">3년</p>
              <span className="rounded px-2 py-1 text-xs font-semibold">
                {getRatingLabel(data.roi_3year.rating)}
              </span>
            </div>
            <p className="text-2xl font-bold">
              {data.roi_3year.roi_percent > 0 ? '+' : ''}
              {data.roi_3year.roi_percent.toFixed(1)}%
            </p>
            <p className="mt-1 text-sm">
              예상 수익: {(data.roi_3year.profit / 10000).toFixed(0)}만원
            </p>
          </div>
        </div>
      </div>

      {/* 전세가율 & 유동성 */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 전세가율 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Home className="h-5 w-5 text-gray-600" />
            <h4 className="font-semibold text-gray-900">전세가율</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {data.jeonse_ratio.current_ratio.toFixed(1)}%
          </p>
          <div className="mt-2 flex items-center gap-2">
            {data.jeonse_ratio.trend === '상승' ? (
              <TrendingUp className="h-4 w-4 text-red-600" />
            ) : data.jeonse_ratio.trend === '하락' ? (
              <TrendingDown className="h-4 w-4 text-green-600" />
            ) : (
              <Activity className="h-4 w-4 text-gray-600" />
            )}
            <span className="text-sm text-gray-600">
              {data.jeonse_ratio.trend}{' '}
              {data.jeonse_ratio.change_percent !== 0 &&
                `(${data.jeonse_ratio.change_percent > 0 ? '+' : ''}${data.jeonse_ratio.change_percent.toFixed(1)}%)`}
            </span>
          </div>
        </div>

        {/* 유동성 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-gray-600" />
            <h4 className="font-semibold text-gray-900">유동성</h4>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-gray-900">
              {data.liquidity.score}
            </p>
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${getLiquidityColor(data.liquidity.level)}`}
            >
              {getLiquidityLabel(data.liquidity.level)}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-gray-600">
            <p>최근 3개월 거래: {data.liquidity.transaction_count_3months}건</p>
            <p>평균 체류 일수: {data.liquidity.days_on_market_avg}일</p>
          </div>
        </div>
      </div>

      {/* 투자 추천 */}
      <div
        className={`rounded-lg border p-4 ${
          data.recommendation.recommended
            ? 'border-green-200 bg-green-50'
            : 'border-yellow-200 bg-yellow-50'
        }`}
      >
        <div className="mb-3 flex items-center gap-2">
          {data.recommendation.recommended ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h4 className="font-semibold text-green-900">투자 추천</h4>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <h4 className="font-semibold text-yellow-900">
                신중한 검토 필요
              </h4>
            </>
          )}
        </div>

        <p
          className={`mb-3 text-sm ${
            data.recommendation.recommended
              ? 'text-green-800'
              : 'text-yellow-800'
          }`}
        >
          {data.recommendation.reason}
        </p>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">주요 고려 요인:</p>
          <ul className="space-y-1">
            {data.recommendation.key_factors.map((factor, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-xs ${
                  data.recommendation.recommended
                    ? 'text-green-700'
                    : 'text-yellow-700'
                }`}
              >
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current"></span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
