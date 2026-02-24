'use client'

import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import type { BusinessPredictionResult } from '@/types/commercial'
import { QualityGateNotice } from '@/components/ui/QualityGateNotice'

interface SuccessProbabilityCardProps {
  result: BusinessPredictionResult
  districtName: string
  industryName: string
}

const QUALITY_FLAG_LABELS: Record<string, string> = {
  missing_business_data: '기초 업종 통계 부족',
  missing_sales_data: '매출 통계 부족',
  missing_store_data: '점포 통계 부족',
  stale_data: '데이터 최신성 낮음',
  industry_location_mismatch: '업종-상권 적합도 주의',
  fallback_rule_based: '모델 대체 추론',
  low_confidence: '신뢰도 낮음',
}

export function SuccessProbabilityCard({
  result,
  districtName,
  industryName,
}: SuccessProbabilityCardProps) {
  const {
    success_probability,
    confidence,
    factors,
    recommendation,
    quality_flags,
  } = result

  const getProbabilityBand = (probability: number) => {
    if (probability >= 75) {
      return {
        label: '우수',
        description:
          '핵심 지표가 안정적입니다. 우선 검토 후보로 볼 수 있습니다.',
        title: '진입 우선 검토 구간',
        circleClassName:
          'text-emerald-700 bg-emerald-50 ring-4 ring-emerald-100',
        progressClassName: 'bg-emerald-500',
        badgeClassName:
          'border border-emerald-200 bg-emerald-50 text-emerald-700',
        recommendationClassName:
          'border border-emerald-200 bg-emerald-50 text-emerald-900',
        positive: true,
      }
    }
    if (probability >= 60) {
      return {
        label: '유망',
        description:
          '진입 가능성은 충분하지만 비용·경쟁 강도 점검이 필요합니다.',
        title: '조건부 진입 구간',
        circleClassName: 'text-blue-700 bg-blue-50 ring-4 ring-blue-100',
        progressClassName: 'bg-blue-500',
        badgeClassName: 'border border-blue-200 bg-blue-50 text-blue-700',
        recommendationClassName:
          'border border-blue-200 bg-blue-50 text-blue-900',
        positive: true,
      }
    }
    if (probability >= 35) {
      return {
        label: '보통',
        description: '추가 검증 후 판단이 필요한 구간입니다.',
        title: '보완 후 재평가 구간',
        circleClassName: 'text-amber-700 bg-amber-50 ring-4 ring-amber-100',
        progressClassName: 'bg-amber-500',
        badgeClassName: 'border border-amber-200 bg-amber-50 text-amber-700',
        recommendationClassName:
          'border border-amber-200 bg-amber-50 text-amber-900',
        positive: false,
      }
    }
    return {
      label: '주의',
      description: '현재 조건에서는 진입 리스크가 높습니다.',
      title: '진입 보류 권장 구간',
      circleClassName: 'text-rose-700 bg-rose-50 ring-4 ring-rose-100',
      progressClassName: 'bg-rose-500',
      badgeClassName: 'border border-rose-200 bg-rose-50 text-rose-700',
      recommendationClassName:
        'border border-rose-200 bg-rose-50 text-rose-900',
      positive: false,
    }
  }

  const getConfidenceTier = (value: number) => {
    if (value >= 77) {
      return {
        label: '신뢰도 높음',
        className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      }
    }
    if (value >= 72) {
      return {
        label: '신뢰도 보통',
        className: 'border border-amber-200 bg-amber-50 text-amber-700',
      }
    }
    return {
      label: '신뢰도 낮음',
      className: 'border border-rose-200 bg-rose-50 text-rose-700',
    }
  }

  const getFactorStyle = (direction: 'positive' | 'negative' | 'neutral') => {
    if (direction === 'positive') {
      return {
        icon: <TrendingUp className="h-5 w-5 text-green-500" />,
        textClassName: 'text-green-600',
        barClassName: 'bg-green-500',
        prefix: '+',
      }
    }
    if (direction === 'negative') {
      return {
        icon: <TrendingDown className="h-5 w-5 text-red-500" />,
        textClassName: 'text-red-600',
        barClassName: 'bg-red-500',
        prefix: '-',
      }
    }
    return {
      icon: <Minus className="h-5 w-5 text-gray-500" />,
      textClassName: 'text-gray-600',
      barClassName: 'bg-gray-400',
      prefix: '',
    }
  }

  const probabilityBand = getProbabilityBand(success_probability)
  const confidenceTier = getConfidenceTier(confidence)
  const visibleFlags = (quality_flags || []).slice(0, 3)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          {districtName} / {industryName}
        </h2>
        <p className="text-gray-600">창업 성공 확률 분석</p>
      </div>

      <div className="mb-8 text-center">
        <div className="mb-4">
          <div
            className={`inline-flex h-32 w-32 items-center justify-center rounded-full ${probabilityBand.circleClassName}`}
          >
            <div>
              <div className="text-4xl font-bold">
                {success_probability.toFixed(1)}%
              </div>
              <div className="text-sm font-medium">성공 확률</div>
            </div>
          </div>
        </div>

        <div className="mb-4 h-3 w-full rounded-full bg-gray-200">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${probabilityBand.progressClassName}`}
            style={{ width: `${success_probability}%` }}
          />
        </div>

        <div className="mb-2 flex justify-center">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${probabilityBand.badgeClassName}`}
          >
            {probabilityBand.label}
          </span>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          {probabilityBand.description}
        </p>

        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <span>분석 신뢰도</span>
          <span className="font-semibold text-gray-900">
            {confidence.toFixed(1)}%
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceTier.className}`}
          >
            {confidenceTier.label}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          데이터 커버리지와 최신성을 반영한 신뢰도입니다.
        </div>

        <QualityGateNotice
          status={result.quality_gate_status}
          grade={result.quality_grade}
          flags={quality_flags || []}
          className="mx-auto mt-3 max-w-xl text-left"
        />

        {visibleFlags.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {visibleFlags.map((flag) => (
              <span
                key={flag}
                className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
              >
                {QUALITY_FLAG_LABELS[flag] || flag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        className={`mb-8 rounded-xl p-4 ${probabilityBand.recommendationClassName}`}
      >
        <div className="flex gap-3">
          {probabilityBand.positive ? (
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          ) : (
            <AlertCircle className="h-6 w-6 text-amber-600" />
          )}
          <div className="flex-1">
            <h3 className="mb-1 font-semibold">{probabilityBand.title}</h3>
            <p className="text-sm">{recommendation}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-semibold text-gray-900">주요 영향 요인</h3>
        <div className="space-y-3">
          {factors.map((factor, index) => {
            const factorStyle = getFactorStyle(factor.direction)
            const impact = Math.abs(Number(factor.impact))
            return (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0">{factorStyle.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {factor.name}
                    </span>
                    <span
                      className={`text-sm font-semibold ${factorStyle.textClassName}`}
                    >
                      {factorStyle.prefix}
                      {impact.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-1.5 rounded-full ${factorStyle.barClassName}`}
                      style={{ width: `${Math.min(impact, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
