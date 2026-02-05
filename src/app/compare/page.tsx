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
    <main className="min-h-screen bg-editorial-bg">
      {/* 헤더 */}
      <div className="border-b border-editorial-dark/5 bg-editorial-bg">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-12">
          {/* 섹션 라벨 */}
          <div className="mb-6">
            <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              <span className="w-8 h-px bg-editorial-gold" />
              Compare
            </span>
          </div>

          <h1 className="font-serif text-4xl md:text-5xl text-editorial-dark tracking-tight mb-4">
            매물 <span className="text-editorial-gold italic">비교</span>
          </h1>
          <p className="text-editorial-ink/60 max-w-xl">
            최대 4개 매물의 참값, 실거래가, 가격요인을 비교해보세요
          </p>
        </div>
      </div>

      {/* 비교 테이블 */}
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-12">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="mb-6 flex justify-center">
                  <div className="h-px w-12 bg-editorial-gold animate-pulse" />
                </div>
                <p className="text-sm tracking-widest uppercase text-editorial-ink/50">
                  Loading
                </p>
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
