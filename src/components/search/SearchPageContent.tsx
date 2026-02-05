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
      <div className="sticky top-16 z-10 border-b border-editorial-dark/5 bg-editorial-bg/95 backdrop-blur-sm">
        <div className="px-6 md:px-8 py-8">
          {/* 섹션 라벨 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              <span className="w-8 h-px bg-editorial-gold" />
              Search Results
            </span>
          </motion.div>

          {/* 제목 + 뷰 토글 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8"
          >
            <div>
              <h1 className="font-serif text-3xl md:text-4xl text-editorial-dark tracking-tight">
                {searchQuery}
                <span className="text-editorial-gold ml-2">검색 결과</span>
              </h1>
            </div>
            <ViewToggle currentView="list" />
          </motion.div>

          {/* 탭 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex gap-1 mb-6"
          >
            <button
              onClick={() => setActiveTab('complexes')}
              className={`
                relative flex items-center gap-2 px-6 py-3 text-sm tracking-wide transition-all
                ${activeTab === 'complexes'
                  ? 'text-editorial-dark'
                  : 'text-editorial-ink/40 hover:text-editorial-ink/70'
                }
              `}
            >
              {activeTab === 'complexes' && (
                <motion.div
                  layoutId="activeSearchTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-editorial-gold"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Building2 className="h-4 w-4" />
              <span className="font-medium">단지</span>
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`
                relative flex items-center gap-2 px-6 py-3 text-sm tracking-wide transition-all
                ${activeTab === 'properties'
                  ? 'text-editorial-dark'
                  : 'text-editorial-ink/40 hover:text-editorial-ink/70'
                }
              `}
            >
              {activeTab === 'properties' && (
                <motion.div
                  layoutId="activeSearchTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-editorial-gold"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Home className="h-4 w-4" />
              <span className="font-medium">매물</span>
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
        className="px-6 md:px-8 py-12"
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
