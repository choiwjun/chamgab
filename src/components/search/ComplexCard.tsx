// 단지 카드 컴포넌트 (Editorial Luxury 스타일)

'use client'

import Link from 'next/link'
import { MapPin, Building, Calendar, Car, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Complex } from '@/types/complex'
import { cn } from '@/lib/utils'

interface ComplexCardProps {
  complex: Complex
  className?: string
  index?: number
}

export function ComplexCard({
  complex,
  className,
  index = 0,
}: ComplexCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        delay: index * 0.08,
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn('group', className)}
    >
      <Link
        href={`/complex/${complex.id}`}
        className="relative block h-full rounded-xl border border-gray-200 bg-white transition-all duration-300 hover:border-gray-300"
      >
        <div className="p-6">
          {/* 상단: 지역 + 브랜드 */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-500">
                {complex.sigungu}
              </span>
              {complex.brand && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500">{complex.brand}</span>
                </>
              )}
            </div>
            <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-blue-500" />
          </div>

          {/* 단지명 */}
          <h3 className="mb-2 line-clamp-2 text-xl font-bold leading-tight text-gray-900 transition-colors group-hover:text-blue-500">
            {complex.name}
          </h3>

          {/* 주소 */}
          <div className="mb-6 flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <p className="line-clamp-1 text-sm text-gray-500">
              {complex.address}
            </p>
          </div>

          {/* 구분선 */}
          <div className="mb-4 h-px bg-gray-200" />

          {/* 상세 정보 */}
          <div className="flex items-center gap-6">
            {complex.total_units && (
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {complex.total_units.toLocaleString()}세대
                </span>
              </div>
            )}
            {complex.built_year && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {complex.built_year}년
                </span>
              </div>
            )}
            {complex.parking_ratio && (
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {complex.parking_ratio.toFixed(1)}대
                </span>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <span className="text-xs font-semibold text-blue-500 transition-colors group-hover:text-gray-900">
              참값 분석 보기
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
