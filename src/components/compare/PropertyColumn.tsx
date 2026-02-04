'use client'

// @TASK P4-S4-T2 - 매물 비교 컬럼 컴포넌트
// @SPEC Phase 4 비교하기 화면 요구사항

import Image from 'next/image'
import Link from 'next/link'
import { X, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import { formatCurrency, formatArea } from '@/lib/format'
import type { CompareProperty } from '@/stores/compareStore'
import type { PriceFactor } from '@/types/chamgab'

interface PropertyColumnProps {
  property: CompareProperty
  factors?: PriceFactor[]
  onRemove: () => void
}

export function PropertyColumn({ property, factors, onRemove }: PropertyColumnProps) {
  const thumbnail =
    property.thumbnail ||
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="240" height="160"%3E%3Crect width="240" height="160" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" fill="%239ca3af"%3ENo Image%3C/text%3E%3C/svg%3E'

  // 가격요인 Top 3
  const topFactors = factors?.slice(0, 3) || []

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative flex-shrink-0 w-full sm:w-64 md:w-72 border border-gray-200 rounded-lg bg-white overflow-hidden"
    >
      {/* 삭제 버튼 */}
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/90 hover:bg-white shadow-sm transition-colors"
        aria-label="매물 제거"
      >
        <X className="w-4 h-4 text-gray-600" />
      </button>

      {/* 이미지 */}
      <Link href={`/property/${property.id}`} className="block">
        <div className="relative h-40 w-full bg-gray-100">
          <Image
            src={thumbnail}
            alt={property.name}
            fill
            unoptimized={!property.thumbnail}
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 288px"
          />
        </div>
      </Link>

      {/* 정보 */}
      <div className="p-4 space-y-3">
        {/* 매물명 */}
        <Link
          href={`/property/${property.id}`}
          className="block hover:text-primary transition-colors"
        >
          <h3 className="font-semibold text-sm text-gray-900 line-clamp-1">
            {property.name}
          </h3>
        </Link>

        {/* 주소 */}
        <div className="flex items-start gap-1">
          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 line-clamp-2">{property.address}</p>
        </div>

        {/* 비교 항목 */}
        <div className="space-y-2 text-xs">
          {/* 참값 */}
          <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
            <span className="text-gray-600">참값</span>
            <span className="font-semibold text-primary">
              {formatCurrency(property.chamgab_price)}
            </span>
          </div>

          {/* 실거래가 */}
          <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
            <span className="text-gray-600">실거래가</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(property.latest_price)}
            </span>
          </div>

          {/* 전용면적 */}
          <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
            <span className="text-gray-600">전용면적</span>
            <span className="text-gray-900">{formatArea(property.area_exclusive)}</span>
          </div>

          {/* 건축년도 */}
          <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
            <span className="text-gray-600">건축년도</span>
            <span className="text-gray-900">
              {property.built_year ? `${property.built_year}년` : '-'}
            </span>
          </div>

          {/* 층수 */}
          <div className="flex justify-between items-center py-1.5 border-t border-gray-100">
            <span className="text-gray-600">층수</span>
            <span className="text-gray-900">
              {property.floors ? `${property.floors}층` : '-'}
            </span>
          </div>
        </div>

        {/* 가격요인 Top 3 */}
        {topFactors.length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">가격요인 Top 3</h4>
            <div className="space-y-1.5">
              {topFactors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{factor.factor_name_ko}</span>
                  <span
                    className={
                      factor.direction === 'positive' ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    {factor.direction === 'positive' ? '+' : ''}
                    {(factor.contribution * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
