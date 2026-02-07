// @TASK P2-S2-T1 - 검색 페이지 콘텐츠 (Editorial Luxury 스타일)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
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
      {/* 헤더 섹션 */}
      <div className="sticky top-16 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="px-6 py-8 md:px-8">
          {/* 섹션 라벨 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500">
              검색 결과
            </span>
          </motion.div>

          {/* 제목 + 뷰 토글 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
                {searchQuery}
              </h1>
            </div>
            <ViewToggle currentView="list" />
          </motion.div>

          {/* 탭 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-6 flex gap-1"
          >
            <button
              onClick={() => setActiveTab('complexes')}
              className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all ${
                activeTab === 'complexes'
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              } `}
            >
              {activeTab === 'complexes' && (
                <motion.div
                  layoutId="activeSearchTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Building2 className="h-4 w-4" />
              <span>단지</span>
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all ${
                activeTab === 'properties'
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              } `}
            >
              {activeTab === 'properties' && (
                <motion.div
                  layoutId="activeSearchTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Home className="h-4 w-4" />
              <span>매물</span>
            </button>
          </motion.div>

          {/* 필터바 (매물 탭에서만 표시) */}
          {activeTab === 'properties' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <FilterBar initialFilters={filters} />
            </motion.div>
          )}
        </div>
      </div>

      {/* 검색 결과 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="px-6 py-12 md:px-8"
      >
        {activeTab === 'complexes' ? (
          <ComplexList sigungu={filters.sigungu} keyword={filters.q} />
        ) : (
          <PropertyList filters={filters} />
        )}
      </motion.div>
    </div>
  )
}
