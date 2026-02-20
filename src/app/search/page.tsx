// @TASK P2-S2-T1 - 검색 페이지 라우트 (Editorial Luxury 스타일)
// @SPEC specs/screens/search-list.yaml

import { Suspense } from 'react'
import { SearchPageContent } from '@/components/search/SearchPageContent'

export const metadata = {
  title: '아파트 시세 조회·검색',
  description:
    '전국 아파트 시세를 검색하고 AI 적정가격을 확인하세요. 지역별, 단지별 실거래가 조회와 가격 비교를 제공합니다.',
  keywords: [
    '아파트 시세 조회',
    '아파트 검색',
    '실거래가 조회',
    '아파트 가격 비교',
    'AI 부동산 분석',
  ],
  alternates: {
    canonical: '/search',
  },
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
