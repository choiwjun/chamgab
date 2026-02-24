// @TASK P4-S5 - 결제/플랜 선택 페이지
import { Metadata } from 'next'
import Link from 'next/link'
import { PlanSelector } from '@/components/checkout/PlanSelector'
import { ENABLE_FREE_OPEN_MODE, ENABLE_LAND } from '@/lib/features'

export const metadata: Metadata = {
  title: '플랜 선택 | 참값',
  description: '사용 패턴에 맞는 크레딧 플랜을 선택하세요.',
}

export default function CheckoutPlansPage() {
  if (ENABLE_FREE_OPEN_MODE) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              전체 무료 운영 중
            </h1>
            <p className="mt-3 text-gray-600">
              현재는 결제 없이 모든 주요 분석 기능을 이용할 수 있습니다.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                서비스로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">플랜 선택</h1>
          <p className="mt-2 text-gray-600">
            {ENABLE_LAND
              ? '아파트/상권/학군/토지 분석을 크레딧으로 이용합니다. 사용량에 맞는 플랜을 선택하세요.'
              : '아파트/상권/학군 분석을 크레딧으로 이용합니다. 사용량에 맞는 플랜을 선택하세요.'}
          </p>
        </div>
        <PlanSelector />
      </div>
    </div>
  )
}
