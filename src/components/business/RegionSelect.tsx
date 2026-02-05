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

export function RegionSelect({ value, onChange, placeholder = '상권 선택' }: RegionSelectProps) {
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

  const selectedDistrict = districts.find((d) => d.code === value)

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
        <span className={selectedDistrict ? 'text-gray-900' : 'text-gray-500'}>
          {isLoading ? '로딩 중...' : selectedDistrict?.name || placeholder}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <ul
          className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
        >
          {districts.length === 0 ? (
            <li className="px-4 py-6 text-center text-gray-500 text-sm">
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
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-50 ${
                  value === district.code ? 'bg-primary-50 text-primary-700' : 'text-gray-900'
                }`}
                role="option"
                aria-selected={value === district.code}
              >
                <div className="font-medium">{district.name}</div>
                <div className="text-sm text-gray-500 mt-0.5">{district.description}</div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
