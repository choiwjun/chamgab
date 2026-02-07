'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, AlertCircle } from 'lucide-react'
import type { DistrictBasic } from '@/types/commercial'
import { getDistricts, APIError } from '@/lib/api/commercial'

interface RegionSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function RegionSelect({
  value,
  onChange,
  placeholder = '상권 선택',
}: RegionSelectProps) {
  const [districts, setDistricts] = useState<DistrictBasic[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const selectedDistrict = districts.find((d) => d.code === value)

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
          {isLoading ? '로딩 중...' : selectedDistrict?.name || placeholder}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <ul
          className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {districts.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              선택 가능한 상권이 없습니다
            </li>
          ) : (
            districts.map((district) => (
              <li
                key={district.code}
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
                className={`cursor-pointer px-4 py-3 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                  value === district.code
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-900'
                }`}
                role="option"
                aria-selected={value === district.code}
              >
                <div className="font-medium">{district.name}</div>
                <div className="mt-0.5 text-sm text-gray-500">
                  {district.description}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
