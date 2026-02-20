// @TASK P4-S5 - 결제/플랜 선택 페이지
import { Metadata } from 'next'
import { PlanSelector } from '@/components/checkout/PlanSelector'

export const metadata: Metadata = {
  title: '플랜 선택 | 참값',
  description: '내 사용 패턴에 맞는 크레딧 플랜을 선택하세요.',
}

export default function CheckoutPlansPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">플랜 선택</h1>
          <p className="mt-2 text-gray-600">
            상권/집값/토지 분석을 크레딧으로 이용합니다. 내 사용량에 맞는 플랜을
            선택하세요.
          </p>
        </div>
        <PlanSelector />
      </div>
    </div>
  )
}
