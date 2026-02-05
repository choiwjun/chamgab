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
    <div className="border-t border-editorial-dark/5 pt-6">
      {/* 필터 토글 버튼 (모바일) */}
      <div className="mb-4 flex items-center gap-3 md:hidden">
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="flex items-center gap-2 border border-editorial-dark/10 bg-white px-4 py-2.5 text-sm tracking-wide text-editorial-dark hover:bg-editorial-sand/30 transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>필터</span>
          {activeFilterCount > 0 && (
            <span className="ml-1 min-w-[20px] h-5 bg-editorial-gold text-white text-xs flex items-center justify-center px-1.5">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-editorial-ink/50 hover:text-editorial-dark transition-colors"
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
          <label className="mb-2 block text-xs tracking-widest uppercase text-editorial-ink/50">
            매물 종류
          </label>
          <select
            value={initialFilters.property_type || ''}
            onChange={(e) => handleFilterChange('property_type', e.target.value || undefined)}
            className="w-full border border-editorial-dark/10 bg-white px-4 py-2.5 text-sm text-editorial-dark focus:border-editorial-gold focus:outline-none transition-colors"
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
          <label className="mb-2 block text-xs tracking-widest uppercase text-editorial-ink/50">
            정렬
          </label>
          <select
            value={initialFilters.sort || 'created_at'}
            onChange={(e) => handleFilterChange('sort', e.target.value)}
            className="w-full border border-editorial-dark/10 bg-white px-4 py-2.5 text-sm text-editorial-dark focus:border-editorial-gold focus:outline-none transition-colors"
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
