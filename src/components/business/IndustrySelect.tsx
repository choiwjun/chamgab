'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, AlertCircle } from 'lucide-react'
import type { Industry } from '@/types/commercial'
import { getIndustries, APIError } from '@/lib/api/commercial'

interface IndustrySelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function IndustrySelect({
  value,
  onChange,
  placeholder = '업종 선택',
}: IndustrySelectProps) {
  const [industries, setIndustries] = useState<Industry[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadIndustries = async () => {
      try {
        setError(null)
        const data = await getIndustries()
        setIndustries(data)
      } catch (err) {
        console.error('업종 목록 로드 실패:', err)
        if (err instanceof APIError) {
          setError(err.message)
        } else {
          setError('업종 목록을 불러오는데 실패했습니다. 다시 시도해주세요.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadIndustries()
  }, [])

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const selectedIndustry = industries.find((i) => i.code === value)

  // 카테고리별로 그룹화
  const categories = Array.from(new Set(industries.map((i) => i.category)))
  const filteredIndustries = selectedCategory
    ? industries.filter((i) => i.category === selectedCategory)
    : industries

  // 에러 상태 UI
  if (error) {
    return (
      <div className="w-full">
        <div className="w-full flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-300 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
        <button
          onClick={() => {
            setIsLoading(true)
            setError(null)
            window.location.reload()
          }}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700 underline"
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
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={placeholder}
      >
        <span className={selectedIndustry ? 'text-gray-900' : 'text-gray-500'}>
          {isLoading ? '로딩 중...' : selectedIndustry?.name || placeholder}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* 카테고리 필터 */}
          <div className="flex gap-2 p-3 border-b border-gray-200 overflow-x-auto">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors whitespace-nowrap ${
                selectedCategory === null
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors whitespace-nowrap ${
                  selectedCategory === category
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* 업종 목록 */}
          <ul className="max-h-60 overflow-y-auto" role="listbox">
            {filteredIndustries.length === 0 ? (
              <li className="px-4 py-6 text-center text-gray-500 text-sm">
                선택 가능한 업종이 없습니다
              </li>
            ) : (
              filteredIndustries.map((industry) => (
                <li
                  key={industry.code}
                  onClick={() => {
                    onChange(industry.code)
                    setIsOpen(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onChange(industry.code)
                      setIsOpen(false)
                    }
                  }}
                  tabIndex={0}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-50 ${
                    value === industry.code ? 'bg-primary-50 text-primary-700' : 'text-gray-900'
                  }`}
                  role="option"
                  aria-selected={value === industry.code}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{industry.name}</div>
                      {industry.description && (
                        <div className="text-sm text-gray-500 mt-0.5">{industry.description}</div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      {industry.category}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
