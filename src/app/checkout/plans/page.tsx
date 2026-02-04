// @TASK P4-S5 - 결제/플랜 선택 페이지
import { Metadata } from 'next'
import { PlanSelector } from '@/components/checkout/PlanSelector'

export const metadata: Metadata = {
  title: '플랜 선택 | 참값',
  description: '나에게 맞는 플랜을 선택하세요',
}

export default function CheckoutPlansPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">플랜 선택</h1>
          <p className="mt-2 text-gray-600">
            나에게 맞는 플랜을 선택하고 더 많은 기능을 이용하세요
          </p>
        </div>
        <PlanSelector />
      </div>
    </div>
  )
}
