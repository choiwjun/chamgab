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
  const {
    success_probability,
    raw_success_probability,
    confidence,
    model_confidence,
    factors,
    recommendation,
    source,
  } = result
  const { ml_status, ml_http_status, ml_detail, data_coverage } = result

  const getProbabilityBand = (probability: number) => {
    if (probability >= 75) {
      return {
        label: '우수',
        description:
          '핵심 지표가 안정적입니다. 실행 계획만 정리되면 진입을 우선 검토할 수 있습니다.',
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
          '진입 가능성이 충분하지만 업종별 고정비와 경쟁 강도를 함께 검토해야 합니다.',
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
        description:
          '손익분기 지점이 불안정할 수 있습니다. 매출 구조와 비용 구조 보완이 필요합니다.',
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
      label: '위험',
      description:
        '현재 지표 기준으로 리스크가 높습니다. 지역 또는 업종 대안 비교를 우선 권장합니다.',
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

  const probabilityBand = getProbabilityBand(success_probability)
  const confidenceTier = getConfidenceTier(confidence)
  const rawProbability =
    typeof raw_success_probability === 'number' &&
    Number.isFinite(raw_success_probability)
      ? Math.min(Math.max(raw_success_probability, 0), 100)
      : null
  const calibrationDelta =
    rawProbability === null ? 0 : success_probability - rawProbability
  const showCalibrationInfo =
    rawProbability !== null && Math.abs(calibrationDelta) >= 0.1

  // NOTE: "ML Model / Rule-based" badge is intentionally hidden per product decision.
  // const sourceLabel =
  //   source === 'ml_model'
  //     ? 'ML Model'
  //     : source === 'rule_based'
  //       ? 'Rule-based (Fallback)'
  //       : null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          {districtName} / {industryName}
        </h2>
        <p className="text-gray-600">창업 성공 확률 분석</p>
        {/* {sourceLabel && (
          <div className="mt-3 inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
            {sourceLabel}
          </div>
        )} */}
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
          데이터 커버리지, 최신성, 확률 보정치를 함께 반영합니다.
        </div>

        {showCalibrationInfo && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <span className="font-semibold">확률 보정</span> 보정 전{' '}
            {rawProbability.toFixed(1)}% -&gt; 보정 후{' '}
            {success_probability.toFixed(1)}%
            <span className="ml-2 font-semibold">
              ({calibrationDelta >= 0 ? '+' : ''}
              {calibrationDelta.toFixed(1)}%p)
            </span>
          </div>
        )}

        {source === 'ml_model' && typeof model_confidence === 'number' && (
          <div className="mt-2 text-xs text-gray-500">
            모델 분류 확신도 {model_confidence.toFixed(1)}% (참고)
          </div>
        )}

        {source === 'rule_based' && confidence < 90 && (
          <div className="mt-3 text-xs text-gray-500">
            ML API 연결/데이터 최신화가 되면 신뢰도가 더 올라갈 수 있습니다.
          </div>
        )}

        {source === 'rule_based' && (ml_status || data_coverage) && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <div className="font-semibold">진단</div>
            {ml_status && (
              <div className="mt-1">
                ML 호출 상태: <span className="font-mono">{ml_status}</span>
                {typeof ml_http_status === 'number' && (
                  <span className="ml-1 font-mono">({ml_http_status})</span>
                )}
                {ml_detail && (
                  <span className="ml-2 text-gray-600">{ml_detail}</span>
                )}
              </div>
            )}
            {data_coverage && (
              <div className="mt-1">
                데이터 커버리지:
                <span className="ml-1 font-mono">
                  biz={data_coverage.business_rows}, sales=
                  {data_coverage.sales_rows}, store={data_coverage.store_rows}
                </span>
              </div>
            )}
            {data_coverage &&
              (data_coverage.sales_rows === 0 ||
                data_coverage.store_rows === 0) && (
                <div className="mt-1 text-gray-600">
                  `sales_statistics`/`store_statistics`가 비어있으면 신뢰도가
                  60% 근처로 내려가는 게 정상입니다.
                </div>
              )}
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
                    {Number(factor.impact).toFixed(1)}
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
                      width: `${Math.min(Math.abs(Number(factor.impact)), 100)}%`,
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
