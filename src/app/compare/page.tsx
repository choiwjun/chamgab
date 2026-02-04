// @TASK P4-S4-T5 - 비교하기 페이지
// @SPEC Phase 4 비교하기 화면 요구사항

import { Suspense } from 'react'
import { CompareTable } from '@/components/compare/CompareTable'

export const metadata = {
  title: '매물 비교 - 참값',
  description: '최대 4개 매물을 비교해보세요',
}

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">매물 비교</h1>
          <p className="text-sm text-gray-600 mt-1">
            최대 4개 매물의 참값, 실거래가, 가격요인을 비교해보세요
          </p>
        </div>
      </div>

      {/* 비교 테이블 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600">불러오는 중...</p>
              </div>
            </div>
          }
        >
          <CompareTable />
        </Suspense>
      </div>
    </main>
  )
}
