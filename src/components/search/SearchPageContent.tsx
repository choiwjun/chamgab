// @TASK P2-S2-T1 - 검색 페이지 콘텐츠 (하이브리드 탭 방식)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Building2, Home } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PropertyList } from './PropertyList'
import { ComplexList } from './ComplexList'
import { ViewToggle } from './ViewToggle'
import type { PropertyQueryParams } from '@/types/property'

type TabType = 'complexes' | 'properties'

export function SearchPageContent() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>('complexes')

  // URL 쿼리 파라미터 파싱
  const filters: PropertyQueryParams = {
    q: searchParams.get('q') || undefined,
    region: searchParams.get('region') || undefined,
    sido: searchParams.get('sido') || undefined,
    sigungu: searchParams.get('sigungu') || undefined,
    property_type:
      (searchParams.get(
        'property_type'
      ) as PropertyQueryParams['property_type']) || undefined,
    min_price: searchParams.get('min_price')
      ? Number(searchParams.get('min_price'))
      : undefined,
    max_price: searchParams.get('max_price')
      ? Number(searchParams.get('max_price'))
      : undefined,
    min_area: searchParams.get('min_area')
      ? Number(searchParams.get('min_area'))
      : undefined,
    max_area: searchParams.get('max_area')
      ? Number(searchParams.get('max_area'))
      : undefined,
    sort: searchParams.get('sort') || 'created_at',
  }

  // 검색어 표시
  const searchQuery = filters.q || filters.sigungu || '전체'

  return (
    <div className="mx-auto max-w-7xl">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-4">
          {/* 제목 + 뷰 토글 */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {searchQuery} 검색 결과
              </h1>
            </div>
            <ViewToggle currentView="list" />
          </div>

          {/* 탭 */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setActiveTab('complexes')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === 'complexes'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Building2 className="h-4 w-4" />
              단지
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === 'properties'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Home className="h-4 w-4" />
              매물
            </button>
          </div>

          {/* 필터바 (매물 탭에서만 표시) */}
          {activeTab === 'properties' && <FilterBar initialFilters={filters} />}
        </div>
      </div>

      {/* 검색 결과 */}
      <div className="px-4 py-6">
        {activeTab === 'complexes' ? (
          <ComplexList sigungu={filters.sigungu} keyword={filters.q} />
        ) : (
          <PropertyList filters={filters} />
        )}
      </div>
    </div>
  )
}
