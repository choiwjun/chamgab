// 단지 카드 컴포넌트

'use client'

import Link from 'next/link'
import { MapPin, Building, Calendar, Car } from 'lucide-react'
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn('group', className)}
    >
      <Link
        href={`/complex/${complex.id}`}
        className="block overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-primary hover:shadow-md"
      >
        {/* 브랜드 배지 */}
        <div className="mb-3 flex items-center gap-2">
          {complex.brand && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {complex.brand}
            </span>
          )}
          <span className="text-xs text-gray-400">{complex.sigungu}</span>
        </div>

        {/* 단지명 */}
        <h3 className="mb-2 text-lg font-bold text-gray-900 group-hover:text-primary">
          {complex.name}
        </h3>

        {/* 주소 */}
        <div className="mb-4 flex items-start gap-1 text-sm text-gray-500">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="line-clamp-1">{complex.address}</span>
        </div>

        {/* 상세 정보 */}
        <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
          {complex.total_units && (
            <div className="text-center">
              <Building className="mx-auto mb-1 h-4 w-4 text-gray-400" />
              <p className="text-xs font-medium text-gray-700">
                {complex.total_units.toLocaleString()}세대
              </p>
            </div>
          )}
          {complex.built_year && (
            <div className="text-center">
              <Calendar className="mx-auto mb-1 h-4 w-4 text-gray-400" />
              <p className="text-xs font-medium text-gray-700">
                {complex.built_year}년
              </p>
            </div>
          )}
          {complex.parking_ratio && (
            <div className="text-center">
              <Car className="mx-auto mb-1 h-4 w-4 text-gray-400" />
              <p className="text-xs font-medium text-gray-700">
                {complex.parking_ratio.toFixed(1)}대
              </p>
            </div>
          )}
        </div>

        {/* 시세 정보 (TODO: API에서 가져오기) */}
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">예상 시세</span>
            <span className="text-sm font-bold text-primary">
              참값 분석 보기 →
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
