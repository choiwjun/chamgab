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

export function PropertyColumn({
  property,
  factors,
  onRemove,
}: PropertyColumnProps) {
  const topFactors = factors?.slice(0, 3) || []
  const region = property.address?.split(' ')[0] || '서울'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative w-full flex-shrink-0 rounded-xl border border-[#E5E8EB] bg-white transition-colors hover:border-[#3182F6]/30 sm:w-72 md:w-80"
    >
      {/* 삭제 버튼 */}
      <button
        onClick={onRemove}
        className="absolute right-4 top-4 z-10 rounded-lg border border-[#E5E8EB] bg-white p-1.5 transition-colors hover:border-[#F04452] hover:text-[#F04452]"
        aria-label="매물 제거"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* 정보 */}
      <div className="p-6">
        {/* 지역 태그 */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-[#8B95A1]">{region}</span>
        </div>

        {/* 매물명 */}
        <Link href={`/property/${property.id}`} className="group/link block">
          <h3 className="mb-2 line-clamp-2 text-lg font-semibold leading-tight text-[#191F28] transition-colors group-hover/link:text-[#3182F6]">
            {property.name}
          </h3>
        </Link>

        {/* 주소 */}
        <div className="mb-6 flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#8B95A1]" />
          <p className="line-clamp-1 text-sm text-[#4E5968]">
            {property.address}
          </p>
        </div>

        {/* 구분선 */}
        <div className="mb-4 h-px bg-[#E5E8EB]" />

        {/* 비교 항목 */}
        <div className="space-y-3 text-sm">
          {/* 참값 */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8B95A1]">참값</span>
            <span className="text-lg font-bold text-[#3182F6]">
              {formatCurrency(property.chamgab_price)}
            </span>
          </div>

          {/* 실거래가 */}
          <div className="flex items-center justify-between border-t border-[#E5E8EB] py-2">
            <span className="text-xs text-[#8B95A1]">실거래가</span>
            <span className="font-medium text-[#191F28]">
              {formatCurrency(property.latest_price)}
            </span>
          </div>

          {/* 전용면적 */}
          <div className="flex items-center justify-between border-t border-[#E5E8EB] py-2">
            <span className="text-xs text-[#8B95A1]">전용면적</span>
            <span className="font-medium text-[#191F28]">
              {formatArea(property.area_exclusive)}
            </span>
          </div>

          {/* 건축년도 */}
          <div className="flex items-center justify-between border-t border-[#E5E8EB] py-2">
            <span className="text-xs text-[#8B95A1]">건축년도</span>
            <span className="font-medium text-[#191F28]">
              {property.built_year ? `${property.built_year}년` : '-'}
            </span>
          </div>

          {/* 층수 */}
          <div className="flex items-center justify-between border-t border-[#E5E8EB] py-2">
            <span className="text-xs text-[#8B95A1]">층수</span>
            <span className="font-medium text-[#191F28]">
              {property.floors ? `${property.floors}층` : '-'}
            </span>
          </div>
        </div>

        {/* 가격요인 Top 3 */}
        {topFactors.length > 0 && (
          <div className="mt-6 border-t border-[#E5E8EB] pt-4">
            <h4 className="mb-3 text-xs font-semibold text-[#8B95A1]">
              가격 요인
            </h4>
            <div className="space-y-2">
              {topFactors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-[#4E5968]">
                    {factor.factor_name_ko}
                  </span>
                  <span
                    className={
                      factor.direction === 'positive'
                        ? 'font-medium text-[#00C471]'
                        : 'font-medium text-[#F04452]'
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
          className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-[#E5E8EB] py-3 text-sm font-medium text-[#191F28] transition-colors hover:bg-[#F9FAFB]"
        >
          <span>상세 보기</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </motion.div>
  )
}
