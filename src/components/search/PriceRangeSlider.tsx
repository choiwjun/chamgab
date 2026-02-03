// @TASK P2-S2-T2 - 가격 범위 슬라이더
// @SPEC specs/screens/search-list.yaml

'use client'

import { useState, useEffect } from 'react'
import { formatPrice } from '@/lib/utils'

interface PriceRangeSliderProps {
  minPrice?: number
  maxPrice?: number
  onPriceChange: (min: number | undefined, max: number | undefined) => void
}

const PRICE_RANGES = [
  { value: 0, label: '전체' },
  { value: 10000000, label: '1천만원' },
  { value: 50000000, label: '5천만원' },
  { value: 100000000, label: '1억원' },
  { value: 300000000, label: '3억원' },
  { value: 500000000, label: '5억원' },
  { value: 1000000000, label: '10억원' },
  { value: 2000000000, label: '20억원' },
  { value: 5000000000, label: '50억원' },
]

export function PriceRangeSlider({
  minPrice,
  maxPrice,
  onPriceChange,
}: PriceRangeSliderProps) {
  const [localMin, setLocalMin] = useState<number | undefined>(minPrice)
  const [localMax, setLocalMax] = useState<number | undefined>(maxPrice)

  useEffect(() => {
    setLocalMin(minPrice)
    setLocalMax(maxPrice)
  }, [minPrice, maxPrice])

  const handleApply = () => {
    onPriceChange(localMin, localMax)
  }

  const handleReset = () => {
    setLocalMin(undefined)
    setLocalMax(undefined)
    onPriceChange(undefined, undefined)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">가격 범위</label>
        {(localMin || localMax) && (
          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            초기화
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 최소 가격 */}
        <div>
          <label className="mb-2 block text-xs text-gray-600">최소</label>
          <select
            value={localMin || 0}
            onChange={(e) => setLocalMin(Number(e.target.value) || undefined)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {PRICE_RANGES.map((range) => (
              <option key={`min-${range.value}`} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* 최대 가격 */}
        <div>
          <label className="mb-2 block text-xs text-gray-600">최대</label>
          <select
            value={localMax || 0}
            onChange={(e) => setLocalMax(Number(e.target.value) || undefined)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {PRICE_RANGES.map((range) => (
              <option key={`max-${range.value}`} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 선택된 가격 범위 표시 */}
      {(localMin || localMax) && (
        <div className="mt-3 text-center text-sm text-gray-600">
          {localMin ? formatPrice(localMin) : '최소'}
          {' ~ '}
          {localMax ? formatPrice(localMax) : '최대'}
        </div>
      )}

      {/* 적용 버튼 */}
      <button
        onClick={handleApply}
        className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
      >
        적용
      </button>
    </div>
  )
}
