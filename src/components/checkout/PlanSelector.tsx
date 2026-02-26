'use client'

import { useMemo, useState } from 'react'
import { Check, Crown, Zap, AlertTriangle } from 'lucide-react'
import { ENABLE_LAND } from '@/lib/features'

interface Plan {
  id: string
  name: string
  price: number
  yearlyPrice?: number
  description: string
  features: string[]
  recommended?: boolean
  icon: React.ReactNode
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: '가볍게 시작하는 기본 플랜',
    icon: <Zap className="h-6 w-6" />,
    features: [
      '일일 20 / 월간 400 크레딧',
      '아파트 분석(요약)',
      '상권분석(요약)',
      '학군분석(프리뷰)',
      ...(ENABLE_LAND ? ['토지분석(요약)'] : []),
    ],
  },
  {
    id: 'premium_monthly',
    name: 'Pro',
    price: 9900,
    yearlyPrice: 99000,
    description: '개인 투자자/창업자용 확장 플랜',
    icon: <Crown className="h-6 w-6" />,
    recommended: true,
    features: [
      '일일 200 / 월간 5,000 크레딧',
      ENABLE_LAND ? '4메뉴 상세 분석' : '3메뉴 상세 분석',
      '유사 사례 비교',
      'PDF 리포트(출시 예정)',
      '우선 지원',
    ],
  },
]

export function PlanSelector() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    'monthly'
  )
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [ackQualityWarning, setAckQualityWarning] = useState(false)
  const [ackNoRefund, setAckNoRefund] = useState(false)

  const COSTS = {
    apartment: 2,
    commercial: 1,
    school: 1,
    land: 4,
  } as const

  const handleSelectPlan = (planId: string) => {
    const plan = PLANS.find((p) => p.id === planId) || null
    setSelectedPlan(plan)
    setAckQualityWarning(false)
    setAckNoRefund(false)
    setShowDialog(true)
  }

  const formatPrice = (price: number) => {
    if (price === 0) return '무료'
    return `${price.toLocaleString('ko-KR')}원`
  }

  const selectedDisplayPrice = useMemo(() => {
    if (!selectedPlan) return '-'
    const monthly =
      billingPeriod === 'yearly' && selectedPlan.yearlyPrice
        ? Math.floor(selectedPlan.yearlyPrice / 12)
        : selectedPlan.price
    return formatPrice(monthly)
  }, [billingPeriod, selectedPlan])

  const canConfirm = ackQualityWarning && ackNoRefund

  return (
    <div>
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">
          크레딧 기반 과금 방식
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          분석 메뉴별로 크레딧이 차감됩니다. 플랜은 기본 지급 크레딧의 한도를
          정하며, 초과 사용은 보너스 크레딧 또는 추가 결제로 운영됩니다.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700">
              아파트 분석
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {COSTS.apartment} 크레딧/회
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700">상권분석</div>
            <div className="mt-1 text-sm text-gray-900">
              {COSTS.commercial} 크레딧/회
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700">학군분석</div>
            <div className="mt-1 text-sm text-gray-900">
              {COSTS.school} 크레딧/회
            </div>
          </div>
          {ENABLE_LAND && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-semibold text-gray-700">
                토지분석
              </div>
              <div className="mt-1 text-sm text-gray-900">
                {COSTS.land} 크레딧/회
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              billingPeriod === 'monthly'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            월간 결제
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              billingPeriod === 'yearly'
                ? 'bg-white text-gray-900 shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            연간 결제{' '}
            <span className="ml-1 text-xs text-green-600">17% 할인</span>
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const price =
            billingPeriod === 'yearly' && plan.yearlyPrice
              ? Math.floor(plan.yearlyPrice / 12)
              : plan.price

          return (
            <div
              key={plan.id}
              className={`relative overflow-hidden rounded-xl border border-gray-200 bg-white p-6 transition hover:border-gray-300 ${
                plan.recommended ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              {plan.recommended && (
                <div className="absolute right-0 top-0 rounded-bl-lg bg-primary px-3 py-1 text-xs font-medium text-white">
                  추천
                </div>
              )}

              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-blue-500">
                {plan.icon}
              </div>

              <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{plan.description}</p>

              <div className="my-6">
                <span className="text-3xl font-bold text-gray-900">
                  {formatPrice(price)}
                </span>
                {price > 0 && (
                  <span className="text-sm text-gray-500">/월</span>
                )}
                {billingPeriod === 'yearly' && plan.yearlyPrice && (
                  <p className="mt-1 text-xs text-gray-400">
                    연 {formatPrice(plan.yearlyPrice)} 결제
                  </p>
                )}
              </div>

              <ul className="mb-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 flex-shrink-0 text-green-500" />
                    <span className="text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={plan.id === 'free'}
                className={`w-full rounded-lg py-3 font-medium transition ${
                  plan.id === 'free'
                    ? 'cursor-default bg-gray-100 text-gray-400'
                    : plan.recommended
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {plan.id === 'free' ? '현재 플랜' : '선택하기'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-16">
        <h2 className="mb-6 text-center text-xl font-bold text-gray-900">
          플랜 비교
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="py-4 text-left font-medium text-gray-500">
                  항목
                </th>
                <th className="py-4 text-center font-medium text-gray-900">
                  Free
                </th>
                <th className="py-4 text-center font-medium text-blue-500">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-4 text-gray-600">월간 크레딧</td>
                <td className="py-4 text-center">400</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  5,000
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">아파트/상권/학군</td>
                <td className="py-4 text-center">기본</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  상세
                </td>
              </tr>
              {ENABLE_LAND && (
                <tr className="border-b">
                  <td className="py-4 text-gray-600">토지분석</td>
                  <td className="py-4 text-center">요약</td>
                  <td className="py-4 text-center font-medium text-blue-500">
                    상세
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-4 text-gray-600">유사 사례 비교</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  포함
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showDialog && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {selectedPlan.name} 플랜 신청
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  결제 전 품질 경고 및 정책 확인이 필요합니다.
                </div>
              </div>
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900"
              >
                닫기
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">선택 플랜</div>
                <div className="mt-1">{selectedPlan.name}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {selectedDisplayPrice}/월 기준
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">품질 경고 안내</p>
                    <p className="mt-1">
                      일부 메뉴는 현재 품질 게이트가 완전히 충족되지 않았을 수
                      있으며, 결과 상단에 품질 경고 배지가 표시됩니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
                <label className="flex items-start gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ackQualityWarning}
                    onChange={(e) => setAckQualityWarning(e.target.checked)}
                  />
                  <span>
                    품질 경고 배지와 결과 해석 제한 안내를 확인했습니다.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ackNoRefund}
                    onChange={(e) => setAckNoRefund(e.target.checked)}
                  />
                  <span>무환불 정책에 동의합니다.</span>
                </label>
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <a
                  href="/admin/users"
                  className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  운영자 사용자/크레딧 관리
                </a>
                <button
                  onClick={() => setShowDialog(false)}
                  disabled={!canConfirm}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  확인 후 종료
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
