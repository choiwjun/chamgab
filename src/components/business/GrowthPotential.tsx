'use client'
const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || '${API_URL}'

import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
} from 'lucide-react'

interface GrowthSignal {
  type: string
  message: string
}

interface GrowthPrediction {
  sales: number
  growth_rate: number
  confidence: number
}

interface GrowthData {
  growth_score: number
  trend: string
  sales_growth_rate: number
  prediction_3months: GrowthPrediction
  signals: GrowthSignal[]
  recommendation: string
}

interface GrowthPotentialProps {
  districtCode: string
}

export default function GrowthPotential({
  districtCode,
}: GrowthPotentialProps) {
  const { data, isLoading, error } = useQuery<GrowthData>({
    queryKey: ['growth-potential', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/commercial/districts/${districtCode}/growth-potential`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch growth potential data')
      }
      return response.json()
    },
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
        <p className="text-red-600">데이터를 불러오는데 실패했습니다.</p>
      </div>
    )
  }

  if (!data) return null

  const TrendIcon =
    data.trend === '상승'
      ? TrendingUp
      : data.trend === '하락'
        ? TrendingDown
        : Minus

  const trendColor =
    data.trend === '상승'
      ? 'text-green-600'
      : data.trend === '하락'
        ? 'text-red-600'
        : 'text-gray-600'

  const scoreColor =
    data.growth_score >= 70
      ? 'green'
      : data.growth_score >= 50
        ? 'yellow'
        : 'red'

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'positive':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'negative':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <MinusCircle className="h-4 w-4 text-gray-600" />
    }
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">성장 가능성 분석</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 성장 점수 */}
        <div
          className={`rounded-lg border p-4 ${
            scoreColor === 'green'
              ? 'border-green-200 bg-green-50'
              : scoreColor === 'yellow'
                ? 'border-yellow-200 bg-yellow-50'
                : 'border-red-200 bg-red-50'
          }`}
        >
          <h4
            className={`mb-2 font-bold ${
              scoreColor === 'green'
                ? 'text-green-900'
                : scoreColor === 'yellow'
                  ? 'text-yellow-900'
                  : 'text-red-900'
            }`}
          >
            성장 점수
          </h4>
          <div className="flex items-end gap-2">
            <p
              className={`text-4xl font-bold ${
                scoreColor === 'green'
                  ? 'text-green-900'
                  : scoreColor === 'yellow'
                    ? 'text-yellow-900'
                    : 'text-red-900'
              }`}
            >
              {data.growth_score}
            </p>
            <span className="mb-1 text-gray-600">/100</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-gray-200">
            <div
              className={`h-3 rounded-full ${
                scoreColor === 'green'
                  ? 'bg-green-500'
                  : scoreColor === 'yellow'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${data.growth_score}%` }}
            ></div>
          </div>
        </div>

        {/* 현재 트렌드 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-2 font-bold text-gray-900">현재 트렌드</h4>
          <div className="flex items-center gap-2">
            <TrendIcon className={`h-8 w-8 ${trendColor}`} />
            <p className={`text-2xl font-bold ${trendColor}`}>{data.trend}</p>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            매출 증가율:{' '}
            <span
              className={`font-semibold ${
                data.sales_growth_rate > 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {data.sales_growth_rate > 0 ? '+' : ''}
              {data.sales_growth_rate.toFixed(1)}%
            </span>
          </p>
        </div>

        {/* 3개월 예측 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h4 className="mb-2 font-bold text-blue-900">3개월 후 예측</h4>
          <p className="text-xl font-bold text-blue-900">
            {(data.prediction_3months.sales / 10000).toFixed(0)}만원
          </p>
          <p className="mt-1 text-sm text-blue-700">
            예상 성장률: {data.prediction_3months.growth_rate > 0 ? '+' : ''}
            {data.prediction_3months.growth_rate.toFixed(1)}%
          </p>
          <div className="mt-2 text-xs text-blue-600">
            신뢰도: {data.prediction_3months.confidence}%
          </div>
        </div>
      </div>

      {/* 성장 시그널 */}
      <div className="mt-6">
        <h4 className="mb-3 font-semibold">📊 성장 시그널</h4>
        <div className="space-y-2">
          {data.signals.map((signal, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg border p-3 ${
                signal.type === 'positive'
                  ? 'border-green-200 bg-green-50'
                  : signal.type === 'negative'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              {getSignalIcon(signal.type)}
              <span
                className={`text-sm ${
                  signal.type === 'positive'
                    ? 'text-green-800'
                    : signal.type === 'negative'
                      ? 'text-red-800'
                      : 'text-gray-800'
                }`}
              >
                {signal.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 추천 */}
      <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
        <h4 className="mb-2 font-bold text-purple-900">💡 투자 추천</h4>
        <p className="text-sm text-purple-800">{data.recommendation}</p>
      </div>
    </div>
  )
}
