// @TASK P2-S2-T2 - 필터 바 컴포넌트 (Editorial Luxury 스타일)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
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
  const handleFilterChange = (
    key: string,
    value: string | number | undefined
  ) => {
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
    <div className="border-t border-gray-200 pt-6">
      {/* 필터 토글 버튼 (모바일) */}
      <div className="mb-4 flex items-center gap-3 md:hidden">
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:border-gray-300"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>필터</span>
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <X className="h-3.5 w-3.5" />
            초기화
          </button>
        )}
      </div>

      {/* 필터 컴포넌트 */}
      <div
        className={`grid gap-6 md:grid-cols-3 ${isFilterOpen ? 'block' : 'hidden md:grid'}`}
      >
        {/* 지역 필터 */}
        <RegionFilter
          sido={initialFilters.sido}
          sigungu={initialFilters.sigungu}
          onSidoChange={(value) => {
            handleFilterChange('sido', value)
            handleFilterChange('sigungu', undefined)
          }}
          onSigunguChange={(value) => handleFilterChange('sigungu', value)}
        />

        {/* 매물 타입 */}
        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-700">
            매물 종류
          </label>
          <select
            value={initialFilters.property_type || ''}
            onChange={(e) =>
              handleFilterChange('property_type', e.target.value || undefined)
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          <label className="mb-2 block text-xs font-semibold text-gray-700">
            정렬
          </label>
          <select
            value={initialFilters.sort || 'created_at'}
            onChange={(e) => handleFilterChange('sort', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="created_at">최신순</option>
            <option value="area_exclusive">면적순</option>
            <option value="built_year">신축순</option>
          </select>
        </div>
      </div>

      {/* 가격 범위 슬라이더 */}
      <div className={`mt-6 ${isFilterOpen ? 'block' : 'hidden md:block'}`}>
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
