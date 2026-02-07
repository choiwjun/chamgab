// @TASK P4-S4-T5 - 비교하기 페이지 (Editorial Luxury 스타일)
// @SPEC Phase 4 비교하기 화면 요구사항

import { Suspense } from 'react'
import { CompareTable } from '@/components/compare/CompareTable'

export const metadata = {
  title: '매물 비교 - 참값',
  description: '최대 4개 매물을 비교해보세요',
}

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* 헤더 */}
      <div className="border-b border-[#E5E8EB] bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12 md:px-8">
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-[#191F28] md:text-5xl">
            매물 비교
          </h1>
          <p className="max-w-xl text-[#4E5968]">
            최대 4개 매물의 참값, 실거래가, 가격요인을 비교해보세요
          </p>
        </div>
      </div>

      {/* 비교 테이블 */}
      <div className="mx-auto max-w-7xl px-6 py-12 md:px-8">
        <Suspense
          fallback={
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <div className="mb-6 flex justify-center">
                  <div className="h-1 w-12 animate-pulse rounded-full bg-[#3182F6]" />
                </div>
                <p className="text-sm text-[#8B95A1]">로딩 중...</p>
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
