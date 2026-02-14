'use client'

import { useState } from 'react'
import { Check, Crown, Building2, Zap } from 'lucide-react'

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
    description: '상권/집값 분석을 가볍게 시작',
    icon: <Zap className="h-6 w-6" />,
    features: [
      '일 크레딧 20 / 월 크레딧 400',
      '상권 분석(기본 요약)',
      '집값 분석(기본)',
      '토지 분석(미제공)',
      '기본 지원',
    ],
  },
  {
    id: 'premium_monthly',
    name: 'Premium',
    price: 9900,
    yearlyPrice: 99000,
    description: '개인/소상공인용 확장 분석',
    icon: <Crown className="h-6 w-6" />,
    recommended: true,
    features: [
      '일 크레딧 200 / 월 크레딧 5,000',
      '상권/집값/토지 분석',
      '유사거래 확장 조회',
      'PDF 리포트(준비중)',
      '우선 지원',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 49900,
    description: '팀/기업 운영용',
    icon: <Building2 className="h-6 w-6" />,
    features: [
      '크레딧 무제한(공정 사용 정책 적용)',
      'Premium 모든 기능',
      '팀/권한 관리',
      '운영 API/RPC',
      'SLA(협의)',
    ],
  },
]

export function PlanSelector() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    'monthly'
  )
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  const COSTS = {
    commercial: 1,
    home_price: 2,
    land: 4,
  } as const

  const handleSelectPlan = (planId: string) => {
    const plan = PLANS.find((p) => p.id === planId) || null
    setSelectedPlan(plan)
    setShowDialog(true)
  }

  const formatPrice = (price: number) => {
    if (price === 0) return '무료'
    return `${price.toLocaleString('ko-KR')}원`
  }

  return (
    <div>
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">
          크레딧 기반 과금 방식
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          분석 메뉴별로 크레딧이 차감되며, 플랜은 일/월 크레딧 한도를
          제공합니다. 보너스 크레딧은 추가 구매(또는 운영 지급)로 충전됩니다.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700">상권 분석</div>
            <div className="mt-1 text-sm text-gray-900">
              {COSTS.commercial} 크레딧/회
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700">집값 분석</div>
            <div className="mt-1 text-sm text-gray-900">
              {COSTS.home_price} 크레딧/회
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-semibold text-gray-700">토지 분석</div>
            <div className="mt-1 text-sm text-gray-900">
              {COSTS.land} 크레딧/회
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          실제 차감 정책은 운영 설정에 따라 조정될 수 있습니다.
        </p>
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

      <div className="grid gap-6 md:grid-cols-3">
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
                  Premium
                </th>
                <th className="py-4 text-center font-medium text-gray-900">
                  Business
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-4 text-gray-600">크레딧</td>
                <td className="py-4 text-center">일 20 / 월 400</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  일 200 / 월 5,000
                </td>
                <td className="py-4 text-center font-medium">무제한</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">보너스 크레딧</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center text-gray-600">
                  추가 구매/운영 지급
                </td>
                <td className="py-4 text-center text-gray-600">
                  추가 구매/운영 지급
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">상권 분석</td>
                <td className="py-4 text-center">기본</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  전체
                </td>
                <td className="py-4 text-center font-medium">전체</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">집값 분석</td>
                <td className="py-4 text-center">기본</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  전체
                </td>
                <td className="py-4 text-center font-medium">전체</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">토지 분석</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  전체
                </td>
                <td className="py-4 text-center font-medium">전체</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">PDF 리포트</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center text-gray-300">준비중</td>
                <td className="py-4 text-center text-gray-300">준비중</td>
              </tr>
              <tr>
                <td className="py-4 text-gray-600">팀/운영 기능</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center">
                  <Check className="mx-auto h-5 w-5 text-green-500" />
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
                  결제 연동 전 운영 안내 화면입니다.
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
                <div className="font-semibold text-gray-900">포함 내용</div>
                <ul className="mt-2 space-y-1">
                  {selectedPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                결제/구독 자동 처리(토스/Stripe)는 준비중입니다. 지금은 운영자가
                수동으로 플랜/크레딧을 적용할 수 있습니다.
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <a
                  href="/admin/users"
                  className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  운영자: 사용자 크레딧 관리
                </a>
                <button
                  onClick={() => setShowDialog(false)}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
