// @TASK P2-S2-T1 - 검색 페이지 라우트 (Editorial Luxury 스타일)
// @SPEC specs/screens/search-list.yaml

import { Suspense } from 'react'
import { SearchPageContent } from '@/components/search/SearchPageContent'

export const metadata = {
  title: '매물 검색 - 참값',
  description: 'AI 기반 부동산 가격 분석 서비스',
}

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <div className="h-1 w-12 animate-pulse rounded-full bg-blue-500" />
              </div>
              <p className="text-sm font-medium text-gray-500">로딩 중</p>
            </div>
          </div>
        }
      >
        <SearchPageContent />
      </Suspense>
    </main>
  )
}
