'use client'

// @TASK P4-S4-T2 - 매물 비교 컬럼 컴포넌트 (Editorial Luxury 스타일)
// @SPEC Phase 4 비교하기 화면 요구사항

import Link from 'next/link'
import { X, MapPin, ArrowUpRight } from 'lucide-react'
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
  const topFactors = factors?.slice(0, 3) || []
  const region = property.address?.split(' ')[0] || '서울'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex-shrink-0 w-full sm:w-72 md:w-80 border border-editorial-dark/5 bg-white group"
    >
      {/* 상단 골드 라인 */}
      <div className="absolute top-0 left-0 w-full h-0.5 bg-editorial-gold" />

      {/* 삭제 버튼 */}
      <button
        onClick={onRemove}
        className="absolute top-4 right-4 z-10 p-1.5 border border-editorial-dark/10 bg-white hover:border-red-300 hover:text-red-500 transition-colors"
        aria-label="매물 제거"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* 정보 */}
      <div className="p-6">
        {/* 지역 태그 */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs tracking-[0.15em] uppercase text-editorial-gold">
            {region}
          </span>
        </div>

        {/* 매물명 */}
        <Link
          href={`/property/${property.id}`}
          className="block group/link"
        >
          <h3 className="font-serif text-lg text-editorial-dark leading-tight mb-2 group-hover/link:text-editorial-gold transition-colors line-clamp-2">
            {property.name}
          </h3>
        </Link>

        {/* 주소 */}
        <div className="flex items-start gap-1.5 mb-6">
          <MapPin className="w-3.5 h-3.5 text-editorial-ink/30 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-editorial-ink/50 line-clamp-1">{property.address}</p>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-editorial-dark/5 mb-4" />

        {/* 비교 항목 */}
        <div className="space-y-3 text-sm">
          {/* 참값 */}
          <div className="flex justify-between items-center">
            <span className="text-xs tracking-wide uppercase text-editorial-ink/50">참값</span>
            <span className="font-serif text-lg text-editorial-gold">
              {formatCurrency(property.chamgab_price)}
            </span>
          </div>

          {/* 실거래가 */}
          <div className="flex justify-between items-center py-2 border-t border-editorial-dark/5">
            <span className="text-xs tracking-wide text-editorial-ink/50">실거래가</span>
            <span className="text-editorial-dark">
              {formatCurrency(property.latest_price)}
            </span>
          </div>

          {/* 전용면적 */}
          <div className="flex justify-between items-center py-2 border-t border-editorial-dark/5">
            <span className="text-xs tracking-wide text-editorial-ink/50">전용면적</span>
            <span className="text-editorial-dark">{formatArea(property.area_exclusive)}</span>
          </div>

          {/* 건축년도 */}
          <div className="flex justify-between items-center py-2 border-t border-editorial-dark/5">
            <span className="text-xs tracking-wide text-editorial-ink/50">건축년도</span>
            <span className="text-editorial-dark">
              {property.built_year ? `${property.built_year}년` : '-'}
            </span>
          </div>

          {/* 층수 */}
          <div className="flex justify-between items-center py-2 border-t border-editorial-dark/5">
            <span className="text-xs tracking-wide text-editorial-ink/50">층수</span>
            <span className="text-editorial-dark">
              {property.floors ? `${property.floors}층` : '-'}
            </span>
          </div>
        </div>

        {/* 가격요인 Top 3 */}
        {topFactors.length > 0 && (
          <div className="mt-6 pt-4 border-t border-editorial-dark/10">
            <h4 className="text-xs tracking-widest uppercase text-editorial-ink/50 mb-3">
              Price Factors
            </h4>
            <div className="space-y-2">
              {topFactors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between text-sm">
                  <span className="text-editorial-ink/70">{factor.factor_name_ko}</span>
                  <span
                    className={
                      factor.direction === 'positive' ? 'text-editorial-sage' : 'text-red-500'
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

        {/* CTA */}
        <Link
          href={`/property/${property.id}`}
          className="mt-6 flex items-center justify-center gap-2 py-3 border border-editorial-dark/10 text-xs tracking-widest uppercase text-editorial-dark hover:bg-editorial-dark hover:text-white transition-colors"
        >
          <span>상세 보기</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.div>
  )
}
