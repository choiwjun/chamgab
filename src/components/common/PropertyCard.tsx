'use client'

// @TASK P2-S1-T4, P2-S2-T3 - 매물 카드 (Editorial Luxury 스타일 - 이미지 없는 버전)
// @SPEC specs/screens/home.yaml#popular_properties
// @SPEC specs/screens/search-list.yaml

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MapPin, Maximize2, Calendar, ArrowUpRight } from 'lucide-react'
import type { Property } from '@/types/property'
import { formatArea } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PropertyCardProps {
  property: Property
  className?: string
  index?: number
  variant?: 'default' | 'compact'
}

export function PropertyCard({
  property,
  className,
  index = 0,
  variant = 'default'
}: PropertyCardProps) {
  // 지역 추출
  const region = property.address?.split(' ')[0] || '서울'
  const subRegion = property.address?.split(' ')[1] || ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group flex-shrink-0', className)}
      style={{ width: variant === 'compact' ? '280px' : '320px' }}
    >
      <Link
        href={`/property/${property.id}`}
        className="block h-full bg-white border border-editorial-dark/5 hover:border-editorial-gold/50 transition-all duration-300 relative"
      >
        {/* 상단 골드 라인 - 호버 시 */}
        <div className="absolute top-0 left-0 w-0 h-0.5 bg-editorial-gold group-hover:w-full transition-all duration-500" />

        <div className="p-6">
          {/* 지역 태그 */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-[0.15em] uppercase text-editorial-gold">
              {region} {subRegion}
            </span>
            <ArrowUpRight className="w-4 h-4 text-editorial-ink/20 group-hover:text-editorial-gold transition-colors" />
          </div>

          {/* 아파트명 */}
          <h3 className="font-serif text-xl text-editorial-dark leading-tight mb-2 group-hover:text-editorial-gold transition-colors line-clamp-2">
            {property.name}
          </h3>

          {/* 주소 */}
          <div className="flex items-start gap-1.5 mb-6">
            <MapPin className="w-3.5 h-3.5 text-editorial-ink/30 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-editorial-ink/50 line-clamp-1">
              {property.address}
            </p>
          </div>

          {/* 구분선 */}
          <div className="h-px bg-editorial-dark/5 mb-4" />

          {/* 상세 정보 */}
          <div className="flex items-center gap-6">
            {property.area_exclusive && (
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {formatArea(property.area_exclusive)}
                </span>
              </div>
            )}
            {property.built_year && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {property.built_year}년
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
