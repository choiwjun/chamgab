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
    description: '부동산 분석 시작하기',
    icon: <Zap className="h-6 w-6" />,
    features: ['일일 분석 10회', '가격 요인 5개', '유사 거래 5개', '기본 지원'],
  },
  {
    id: 'premium_monthly',
    name: 'Premium',
    price: 9900,
    yearlyPrice: 99000,
    description: '전문가용 분석 도구',
    icon: <Crown className="h-6 w-6" />,
    recommended: true,
    features: [
      '무제한 분석',
      '가격 요인 10개',
      '유사 거래 20개',
      'PDF 리포트 다운로드',
      '우선 지원',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 49900,
    description: '기업 및 팀용',
    icon: <Building2 className="h-6 w-6" />,
    features: [
      'Premium 모든 기능',
      '팀 멤버 관리',
      'API 접근',
      '전담 매니저',
      'SLA 보장',
    ],
  },
]

export function PlanSelector() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    'monthly'
  )
  const [, setSelectedPlan] = useState<string | null>(null)
  const [showComingSoon, setShowComingSoon] = useState(false)

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId)
    // TODO: Toss Payments 연동
    setShowComingSoon(true)
    setTimeout(() => setShowComingSoon(false), 3000)
  }

  const formatPrice = (price: number) => {
    if (price === 0) return '무료'
    return `${price.toLocaleString()}원`
  }

  return (
    <div>
      {/* 결제 준비 중 메시지 */}
      {showComingSoon && (
        <div className="mb-6 rounded-xl border border-[#8B95A1]/20 bg-[#F2F4F6] px-4 py-3 text-center">
          <p className="text-sm text-[#8B95A1]">결제 기능은 준비 중입니다</p>
        </div>
      )}

      {/* 결제 주기 토글 */}
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
            연간 결제
            <span className="ml-1 text-xs text-green-600">17% 할인</span>
          </button>
        </div>
      </div>

      {/* 플랜 카드 */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const price =
            billingPeriod === 'yearly' && plan.yearlyPrice
              ? Math.floor(plan.yearlyPrice / 12)
              : plan.price

          return (
            <div
              key={plan.id}
              className={`relative overflow-hidden rounded-xl border border-gray-100 border-gray-200 bg-white p-6 transition hover:border ${
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

      {/* 비교 테이블 */}
      <div className="mt-16">
        <h2 className="mb-6 text-center text-xl font-bold text-gray-900">
          플랜 비교
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="py-4 text-left font-medium text-gray-500">
                  기능
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
                <td className="py-4 text-gray-600">일일 분석</td>
                <td className="py-4 text-center">10회</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  무제한
                </td>
                <td className="py-4 text-center font-medium">무제한</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">가격 요인</td>
                <td className="py-4 text-center">5개</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  10개
                </td>
                <td className="py-4 text-center font-medium">10개</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">유사 거래</td>
                <td className="py-4 text-center">5개</td>
                <td className="py-4 text-center font-medium text-blue-500">
                  20개
                </td>
                <td className="py-4 text-center font-medium">20개</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">PDF 리포트</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center">
                  <Check className="mx-auto h-5 w-5 text-green-500" />
                </td>
                <td className="py-4 text-center">
                  <Check className="mx-auto h-5 w-5 text-green-500" />
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-gray-600">API 접근</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center text-gray-300">-</td>
                <td className="py-4 text-center">
                  <Check className="mx-auto h-5 w-5 text-green-500" />
                </td>
              </tr>
              <tr>
                <td className="py-4 text-gray-600">팀 기능</td>
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
    </div>
  )
}
