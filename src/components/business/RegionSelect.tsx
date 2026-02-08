'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, ChevronRight, AlertCircle, Search, X } from 'lucide-react'
import type { DistrictBasic } from '@/types/commercial'
import { getDistricts, APIError } from '@/lib/api/commercial'

interface RegionSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** 시도 이름 축약 (서울특별시 → 서울) */
function shortSido(sido: string) {
  return sido
    .replace('특별시', '')
    .replace('광역시', '')
    .replace('특별자치시', '')
    .replace('특별자치도', '')
    .replace(/도$/, '')
}

const SIDO_ORDER = [
  '서울특별시',
  '경기도',
  '인천광역시',
  '부산광역시',
  '대구광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '충청북도',
  '충청남도',
  '전라북도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
]

export function RegionSelect({
  value,
  onChange,
  placeholder = '상권 선택',
}: RegionSelectProps) {
  const [districts, setDistricts] = useState<DistrictBasic[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSido, setSelectedSido] = useState<string | null>(null)
  const [expandedSidos, setExpandedSidos] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadDistricts = async () => {
      try {
        setError(null)
        const data = await getDistricts()
        setDistricts(data)
      } catch (err) {
        console.error('상권 목록 로드 실패:', err)
        if (err instanceof APIError) {
          setError(err.message)
        } else {
          setError('상권 목록을 불러오는데 실패했습니다. 다시 시도해주세요.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadDistricts()
  }, [])

  // 드롭다운 열릴 때 검색 입력에 포커스
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
    if (!isOpen) {
      setSearchQuery('')
      setSelectedSido(null)
      setExpandedSidos(new Set())
    }
  }, [isOpen])

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 키보드 내비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true)
    }
  }

  // 사용 가능한 시도 목록
  const availableSidos = useMemo(() => {
    const sidos = new Set(districts.map((d) => d.sido || '기타'))
    return SIDO_ORDER.filter((s) => sidos.has(s))
  }, [districts])

  // 시도별 그룹핑 + 검색/시도 필터링
  const groupedDistricts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    let filtered = districts

    // 검색어 필터
    if (q) {
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.sido || '').toLowerCase().includes(q) ||
          shortSido(d.sido || '')
            .toLowerCase()
            .includes(q) ||
          d.code.includes(q)
      )
    }

    // 시도 필터 (검색어가 없을 때만 적용)
    if (selectedSido && !q) {
      filtered = filtered.filter((d) => d.sido === selectedSido)
    }

    // 시도별 그룹핑
    const groups: Record<string, DistrictBasic[]> = {}
    for (const d of filtered) {
      const sido = d.sido || '기타'
      if (!groups[sido]) groups[sido] = []
      groups[sido].push(d)
    }

    return Object.entries(groups).sort(([a], [b]) => {
      const ia = SIDO_ORDER.indexOf(a)
      const ib = SIDO_ORDER.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [districts, searchQuery, selectedSido])

  const selectedDistrict = districts.find((d) => d.code === value)
  const totalFiltered = groupedDistricts.reduce(
    (sum, [, items]) => sum + items.length,
    0
  )

  const toggleSidoExpand = (sido: string) => {
    setExpandedSidos((prev) => {
      const next = new Set(prev)
      if (next.has(sido)) {
        next.delete(sido)
      } else {
        next.add(sido)
      }
      return next
    })
  }

  // 검색어가 있거나 시도 필터가 선택되면 모든 그룹 펼치기
  const isAllExpanded = !!searchQuery || !!selectedSido

  // 에러 상태 UI
  if (error) {
    return (
      <div className="w-full">
        <div className="flex w-full items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
        <button
          onClick={() => {
            setIsLoading(true)
            setError(null)
            window.location.reload()
          }}
          className="mt-2 text-sm text-blue-600 underline hover:text-blue-700"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3 transition-colors hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
      >
        <span className={selectedDistrict ? 'text-gray-900' : 'text-gray-500'}>
          {isLoading
            ? '로딩 중...'
            : selectedDistrict
              ? `${selectedDistrict.sido ? shortSido(selectedDistrict.sido) + ' ' : ''}${selectedDistrict.name}`
              : placeholder}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* 검색 입력 */}
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="지역명 검색 (예: 강남, 분당, 해운대)"
                className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* 시/도 퀵 필터 칩 */}
          {!searchQuery && (
            <div className="flex flex-wrap gap-1.5 border-b border-gray-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedSido(null)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  !selectedSido
                    ? 'bg-[#3182F6] text-white'
                    : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
                }`}
              >
                전체
              </button>
              {availableSidos.map((sido) => (
                <button
                  key={sido}
                  type="button"
                  onClick={() =>
                    setSelectedSido(selectedSido === sido ? null : sido)
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedSido === sido
                      ? 'bg-[#3182F6] text-white'
                      : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
                  }`}
                >
                  {shortSido(sido)}
                </button>
              ))}
            </div>
          )}

          {/* 선택된 시도 필터 표시 */}
          {selectedSido && !searchQuery && (
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-1.5">
              <span className="text-xs text-[#4E5968]">
                {selectedSido} ({totalFiltered}개)
              </span>
              <button
                type="button"
                onClick={() => setSelectedSido(null)}
                className="rounded-full p-0.5 hover:bg-gray-100"
              >
                <X className="h-3 w-3 text-[#8B95A1]" />
              </button>
            </div>
          )}

          {/* 목록 */}
          <ul className="max-h-80 overflow-y-auto" role="listbox">
            {totalFiltered === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-gray-500">
                {searchQuery
                  ? `"${searchQuery}" 검색 결과가 없습니다`
                  : '선택 가능한 상권이 없습니다'}
              </li>
            ) : (
              groupedDistricts.map(([sido, items]) => {
                const isExpanded = isAllExpanded || expandedSidos.has(sido)
                return (
                  <li key={sido}>
                    {/* 시도 헤더 (접이식) */}
                    <button
                      type="button"
                      onClick={() => !isAllExpanded && toggleSidoExpand(sido)}
                      className="flex w-full items-center gap-1.5 bg-[#F9FAFB] px-4 py-2 text-left transition-colors hover:bg-[#F2F4F6]"
                    >
                      {!isAllExpanded && (
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-[#8B95A1] transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                      )}
                      <span className="text-xs font-semibold text-[#4E5968]">
                        {sido}
                      </span>
                      <span className="text-xs text-[#8B95A1]">
                        ({items.length})
                      </span>
                    </button>
                    {/* 시군구 목록 */}
                    {isExpanded && (
                      <ul>
                        {items.map((district) => (
                          <li
                            key={`${sido}-${district.code}`}
                            onClick={() => {
                              onChange(district.code)
                              setIsOpen(false)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                onChange(district.code)
                                setIsOpen(false)
                              }
                            }}
                            tabIndex={0}
                            className={`cursor-pointer px-4 py-2.5 transition-colors hover:bg-[#F9FAFB] focus:bg-[#F9FAFB] focus:outline-none ${
                              value === district.code
                                ? 'bg-blue-50 text-[#3182F6]'
                                : 'text-[#191F28]'
                            }`}
                            role="option"
                            aria-selected={value === district.code}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {district.name}
                              </span>
                              {district.has_data === false && (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">
                                  데이터 수집중
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
