// @TASK P2-S2-T1 - 검색 페이지 콘텐츠 (Toss Clean Style + 지역 퀵필터)
// @SPEC specs/screens/search-list.yaml

'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Building2, Home, Search, X, ChevronDown } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { PropertyList } from './PropertyList'
import { ComplexList } from './ComplexList'
import { ViewToggle } from './ViewToggle'
import type { PropertyQueryParams } from '@/types/property'

type TabType = 'complexes' | 'properties'

// 시도 목록 (데이터가 있는 주요 지역)
const SIDO_LIST = [
  { name: '서울특별시', short: '서울' },
  { name: '경기도', short: '경기' },
  { name: '인천광역시', short: '인천' },
  { name: '부산광역시', short: '부산' },
  { name: '대구광역시', short: '대구' },
  { name: '광주광역시', short: '광주' },
  { name: '대전광역시', short: '대전' },
  { name: '울산광역시', short: '울산' },
  { name: '세종특별자치시', short: '세종' },
  { name: '충청북도', short: '충북' },
  { name: '충청남도', short: '충남' },
  { name: '전라북도', short: '전북' },
  { name: '전라남도', short: '전남' },
  { name: '경상북도', short: '경북' },
  { name: '경상남도', short: '경남' },
  { name: '제주특별자치도', short: '제주' },
]

interface SigunguItem {
  name: string
  code: string
}

interface SidoRegion {
  name: string
  code: string
}

export function SearchPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('complexes')
  const [searchInput, setSearchInput] = useState('')
  const [selectedSido, setSelectedSido] = useState<string | null>(null)
  const [sidoRegions, setSidoRegions] = useState<SidoRegion[]>([])
  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([])
  const [isSigunguLoading, setIsSigunguLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  // 시도 목록 로드 (코드 매핑용)
  useEffect(() => {
    fetch('/api/regions?level=1&limit=100')
      .then((res) => res.json())
      .then((json) => {
        const items = (json.data || []).map(
          (r: { name: string; code: string }) => ({
            name: r.name,
            code: r.code,
          })
        )
        setSidoRegions(items)
      })
      .catch(() => {})
  }, [])

  // URL에서 sido 복원
  useEffect(() => {
    if (filters.sido) {
      setSelectedSido(filters.sido)
    }
  }, [filters.sido])

  // 시도 선택 시 시군구 목록 가져오기
  useEffect(() => {
    if (!selectedSido) {
      setSigunguList([])
      return
    }

    // 시도 코드 찾기
    const sidoRegion = sidoRegions.find((r) => r.name === selectedSido)
    if (!sidoRegion) return

    setIsSigunguLoading(true)
    fetch(`/api/regions?level=2&parent_code=${sidoRegion.code}&limit=100`)
      .then((res) => res.json())
      .then((json) => {
        const items = (json.data || []).map(
          (r: { name: string; code: string }) => ({
            name: r.name,
            code: r.code,
          })
        )
        setSigunguList(items)
      })
      .catch(() => setSigunguList([]))
      .finally(() => setIsSigunguLoading(false))
  }, [selectedSido, sidoRegions])

  // 검색어 표시
  const hasActiveFilter = filters.q || filters.sido || filters.sigungu
  const searchTitle =
    filters.sigungu ||
    filters.q ||
    (filters.sido
      ? SIDO_LIST.find((s) => s.name === filters.sido)?.short || filters.sido
      : '')

  // 검색 핸들러
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchInput.trim()
    if (q) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/search?q=${encodeURIComponent(q)}` as any)
      setSearchInput('')
      setSelectedSido(null)
    }
  }

  // 시도 클릭
  const handleSidoClick = (sidoName: string) => {
    if (selectedSido === sidoName) {
      // 같은 시도 재클릭 → 해제
      setSelectedSido(null)
      router.push('/search')
    } else {
      setSelectedSido(sidoName)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(`/search?sido=${encodeURIComponent(sidoName)}` as any)
    }
  }

  // 시군구 클릭
  const handleSigunguClick = (sigunguName: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(
      `/search?sido=${encodeURIComponent(selectedSido || '')}&sigungu=${encodeURIComponent(sigunguName)}` as any
    )
  }

  // 필터 초기화
  const handleClearFilter = () => {
    setSelectedSido(null)
    setSearchInput('')
    router.push('/search')
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* 헤더 섹션 */}
      <div className="sticky top-16 z-10 border-b border-[#E5E8EB] bg-white/95 backdrop-blur-sm">
        <div className="px-6 py-6 md:px-8">
          {/* 인라인 검색 바 */}
          <form onSubmit={handleSearch} className="mb-5">
            <div className="flex items-center gap-3 rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-4 py-3 transition-all focus-within:border-[#3182F6] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#3182F6]">
              <Search className="h-5 w-5 flex-shrink-0 text-[#8B95A1]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="아파트명, 지역 검색 (예: 래미안, 강남구, 분당)"
                className="flex-1 bg-transparent text-sm text-[#191F28] outline-none placeholder:text-[#8B95A1]"
                aria-label="매물 검색"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="rounded-full p-1 hover:bg-[#E5E8EB]"
                >
                  <X className="h-4 w-4 text-[#8B95A1]" />
                </button>
              )}
            </div>
          </form>

          {/* 시/도 칩 (가로 스크롤 한 줄) + 시군구 드롭다운 */}
          <div className="mb-4 flex items-center gap-3">
            {/* 시도 가로 스크롤 */}
            <div className="scrollbar-hide flex-1 overflow-x-auto">
              <div className="flex gap-1.5 pb-1">
                {SIDO_LIST.map((sido) => (
                  <button
                    key={sido.name}
                    type="button"
                    onClick={() => handleSidoClick(sido.name)}
                    className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedSido === sido.name || filters.sido === sido.name
                        ? 'bg-[#3182F6] text-white'
                        : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
                    }`}
                  >
                    {sido.short}
                  </button>
                ))}
              </div>
            </div>

            {/* 시군구 드롭다운 (시도 선택 시 표시) */}
            {(selectedSido || filters.sido) && (
              <div className="relative flex-shrink-0">
                <select
                  value={filters.sigungu || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val) {
                      handleSigunguClick(val)
                    } else {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      router.push(
                        `/search?sido=${encodeURIComponent(selectedSido || '')}` as any
                      )
                    }
                  }}
                  disabled={isSigunguLoading}
                  className="appearance-none rounded-lg border border-[#E5E8EB] bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-[#191F28] transition-colors hover:border-[#3182F6] focus:border-[#3182F6] focus:outline-none focus:ring-1 focus:ring-[#3182F6] disabled:bg-[#F2F4F6] disabled:text-[#8B95A1]"
                >
                  <option value="">
                    {isSigunguLoading
                      ? '로딩...'
                      : `${SIDO_LIST.find((s) => s.name === (selectedSido || filters.sido))?.short || '시도'} 전체`}
                  </option>
                  {sigunguList.map((sg) => (
                    <option key={sg.code} value={sg.name}>
                      {sg.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8B95A1]" />
              </div>
            )}
          </div>

          {/* 활성 필터 표시 + 제목 */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasActiveFilter ? (
                <>
                  <h1 className="text-xl font-bold text-[#191F28]">
                    {searchTitle || '검색 결과'}
                  </h1>
                  <button
                    onClick={handleClearFilter}
                    className="flex items-center gap-1 rounded-full bg-[#F2F4F6] px-2.5 py-1 text-xs text-[#4E5968] hover:bg-[#E5E8EB]"
                  >
                    <X className="h-3 w-3" />
                    초기화
                  </button>
                </>
              ) : (
                <h1 className="text-xl font-bold text-[#191F28]">전체 단지</h1>
              )}
            </div>
            <ViewToggle currentView="list" />
          </div>

          {/* 탭 */}
          <div className="flex gap-1 border-t border-[#E5E8EB] pt-3">
            <button
              onClick={() => setActiveTab('complexes')}
              className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'complexes'
                  ? 'text-[#191F28]'
                  : 'text-[#8B95A1] hover:text-[#4E5968]'
              }`}
            >
              {activeTab === 'complexes' && (
                <motion.div
                  layoutId="activeSearchTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3182F6]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Building2 className="h-4 w-4" />
              <span>단지</span>
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'properties'
                  ? 'text-[#191F28]'
                  : 'text-[#8B95A1] hover:text-[#4E5968]'
              }`}
            >
              {activeTab === 'properties' && (
                <motion.div
                  layoutId="activeSearchTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3182F6]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Home className="h-4 w-4" />
              <span>매물</span>
            </button>
          </div>

          {/* 필터바 (매물 탭에서만 표시) */}
          {activeTab === 'properties' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="pt-4"
            >
              <FilterBar initialFilters={filters} />
            </motion.div>
          )}
        </div>
      </div>

      {/* 검색 결과 */}
      <div className="px-6 py-8 md:px-8">
        {activeTab === 'complexes' ? (
          <ComplexList
            sido={filters.sido}
            sigungu={filters.sigungu}
            keyword={filters.q}
          />
        ) : (
          <PropertyList filters={filters} />
        )}
      </div>
    </div>
  )
}
