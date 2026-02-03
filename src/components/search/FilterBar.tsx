// @TASK P2-S2-T2 - 필터 바 컴포넌트
// @SPEC specs/screens/search-list.yaml

'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RegionFilter } from './RegionFilter'
import { PriceRangeSlider } from './PriceRangeSlider'
import type { PropertyQueryParams } from '@/types/property'

interface FilterBarProps {
  initialFilters: PropertyQueryParams
}

export function FilterBar({ initialFilters }: FilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // 필터 변경 핸들러
  const handleFilterChange = (key: string, value: string | number | undefined) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value === undefined || value === '') {
      params.delete(key)
    } else {
      params.set(key, String(value))
    }

    router.push(`/search?${params.toString()}`)
  }

  // 필터 초기화
  const handleReset = () => {
    router.push('/search')
  }

  // 활성 필터 개수
  const activeFilterCount = Object.entries(initialFilters).filter(
    ([key, value]) => key !== 'sort' && value !== undefined
  ).length

  return (
    <div>
      {/* 필터 토글 버튼 (모바일) */}
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          필터
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            초기화
          </button>
        )}
      </div>

      {/* 필터 컴포넌트 */}
      <div
        className={`grid gap-4 md:grid-cols-3 ${isFilterOpen ? 'block' : 'hidden md:grid'}`}
      >
        {/* 지역 필터 */}
        <RegionFilter
          sido={initialFilters.sido}
          sigungu={initialFilters.sigungu}
          onSidoChange={(value) => {
            handleFilterChange('sido', value)
            handleFilterChange('sigungu', undefined) // 시도 변경 시 시군구 초기화
          }}
          onSigunguChange={(value) => handleFilterChange('sigungu', value)}
        />

        {/* 매물 타입 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            매물 종류
          </label>
          <select
            value={initialFilters.property_type || ''}
            onChange={(e) => handleFilterChange('property_type', e.target.value || undefined)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">전체</option>
            <option value="apt">아파트</option>
            <option value="officetel">오피스텔</option>
            <option value="villa">빌라</option>
            <option value="store">상가</option>
            <option value="land">토지</option>
            <option value="building">건물</option>
          </select>
        </div>

        {/* 정렬 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            정렬
          </label>
          <select
            value={initialFilters.sort || 'created_at'}
            onChange={(e) => handleFilterChange('sort', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="created_at">최신순</option>
            <option value="area_exclusive">면적순</option>
            <option value="built_year">신축순</option>
          </select>
        </div>
      </div>

      {/* 가격 범위 슬라이더 */}
      <div className={`mt-4 ${isFilterOpen ? 'block' : 'hidden md:block'}`}>
        <PriceRangeSlider
          minPrice={initialFilters.min_price}
          maxPrice={initialFilters.max_price}
          onPriceChange={(min, max) => {
            handleFilterChange('min_price', min)
            handleFilterChange('max_price', max)
          }}
        />
      </div>
    </div>
  )
}
