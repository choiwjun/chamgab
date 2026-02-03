// @TASK P2-S2-T1 - 검색 페이지 콘텐츠 (URL 쿼리 파라미터 처리)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useSearchParams } from 'next/navigation'
import { FilterBar } from './FilterBar'
import { PropertyList } from './PropertyList'
import { ViewToggle } from './ViewToggle'
import type { PropertyQueryParams } from '@/types/property'

export function SearchPageContent() {
  const searchParams = useSearchParams()

  // URL 쿼리 파라미터 파싱
  const filters: PropertyQueryParams = {
    sido: searchParams.get('sido') || undefined,
    sigungu: searchParams.get('sigungu') || undefined,
    property_type: (searchParams.get('property_type') as PropertyQueryParams['property_type']) || undefined,
    min_price: searchParams.get('min_price') ? Number(searchParams.get('min_price')) : undefined,
    max_price: searchParams.get('max_price') ? Number(searchParams.get('max_price')) : undefined,
    min_area: searchParams.get('min_area') ? Number(searchParams.get('min_area')) : undefined,
    max_area: searchParams.get('max_area') ? Number(searchParams.get('max_area')) : undefined,
    sort: searchParams.get('sort') || 'created_at',
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* 헤더 (필터바 + 뷰 토글) */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">매물 검색</h1>
            <ViewToggle currentView="list" />
          </div>
          <FilterBar initialFilters={filters} />
        </div>
      </div>

      {/* 검색 결과 리스트 */}
      <div className="px-4 py-6">
        <PropertyList filters={filters} />
      </div>
    </div>
  )
}
