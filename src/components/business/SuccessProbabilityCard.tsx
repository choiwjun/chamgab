'use client'

import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import type { BusinessPredictionResult } from '@/types/commercial'

interface SuccessProbabilityCardProps {
  result: BusinessPredictionResult
  districtName: string
  industryName: string
}

export function SuccessProbabilityCard({
  result,
  districtName,
  industryName,
}: SuccessProbabilityCardProps) {
  const { success_probability, confidence, factors, recommendation } = result

  // 성공 확률에 따른 색상
  const getColorClass = (probability: number) => {
    if (probability >= 70) return 'text-green-600 bg-green-50'
    if (probability >= 50) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getProgressColor = (probability: number) => {
    if (probability >= 70) return 'bg-green-500'
    if (probability >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getRecommendationIcon = (probability: number) => {
    if (probability >= 70)
      return <CheckCircle className="h-6 w-6 text-green-600" />
    if (probability >= 50)
      return <AlertCircle className="h-6 w-6 text-yellow-600" />
    return <AlertCircle className="h-6 w-6 text-red-600" />
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8">
      {/* 헤더 */}
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          {districtName} × {industryName}
        </h2>
        <p className="text-gray-600">창업 성공 예측 분석</p>
      </div>

      {/* 성공 확률 */}
      <div className="mb-8 text-center">
        <div className="mb-4">
          <div
            className={`inline-flex h-32 w-32 items-center justify-center rounded-full ${getColorClass(success_probability)}`}
          >
            <div>
              <div className="text-4xl font-bold">
                {success_probability.toFixed(1)}%
              </div>
              <div className="text-sm font-medium">성공 확률</div>
            </div>
          </div>
        </div>

        {/* 프로그레스 바 */}
        <div className="mb-4 h-3 w-full rounded-full bg-gray-200">
          <div
            className={`h-3 rounded-full transition-all duration-1000 ${getProgressColor(success_probability)}`}
            style={{ width: `${success_probability}%` }}
          />
        </div>

        {/* 신뢰도 */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <span>분석 신뢰도:</span>
          <span className="font-semibold text-gray-900">
            {confidence.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 추천 메시지 */}
      <div
        className={`rounded-xl p-4 ${getColorClass(success_probability)} mb-8`}
      >
        <div className="flex gap-3">
          {getRecommendationIcon(success_probability)}
          <div className="flex-1">
            <h3 className="mb-1 font-semibold">종합 평가</h3>
            <p className="text-sm">{recommendation}</p>
          </div>
        </div>
      </div>

      {/* 주요 요인 */}
      <div>
        <h3 className="mb-4 font-semibold text-gray-900">주요 영향 요인</h3>
        <div className="space-y-3">
          {factors.map((factor, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {factor.direction === 'positive' ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {factor.name}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      factor.direction === 'positive'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {factor.direction === 'positive' ? '+' : '-'}
                    {factor.impact.toFixed(1)}점
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-1.5 rounded-full ${
                      factor.direction === 'positive'
                        ? 'bg-green-500'
                        : 'bg-red-500'
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(factor.impact), 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
