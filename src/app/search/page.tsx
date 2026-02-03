// @TASK P2-S2-T1 - 검색 페이지 라우트
// @SPEC specs/screens/search-list.yaml
// @TEST tests/app/search/page.test.tsx

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
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-gray-600">검색 중...</p>
            </div>
          </div>
        }
      >
        <SearchPageContent />
      </Suspense>
    </main>
  )
}
