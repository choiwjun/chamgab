'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MapPin, Maximize2, Calendar } from 'lucide-react'
import type { Property, PropertyType } from '@/types/property'
import { formatArea } from '@/lib/format'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<PropertyType, string> = {
  apt: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  store: '상가',
  land: '토지',
  building: '단독주택',
}

const TYPE_COLOR: Record<PropertyType, string> = {
  apt: 'bg-blue-50 text-blue-600',
  officetel: 'bg-violet-50 text-violet-600',
  villa: 'bg-emerald-50 text-emerald-600',
  store: 'bg-amber-50 text-amber-600',
  land: 'bg-stone-100 text-stone-600',
  building: 'bg-orange-50 text-orange-600',
}

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
  variant = 'default',
}: PropertyCardProps) {
  const region = property.address?.split(' ')[0] || '서울'
  const subRegion = property.address?.split(' ')[1] || ''
  const ptype = property.property_type || 'apt'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn('group flex-shrink-0', className)}
      style={{ width: variant === 'compact' ? '280px' : '300px' }}
    >
      <Link
        href={`/property/${property.id}`}
        className="block h-full overflow-hidden rounded-2xl border border-[#E5E8EB] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D1D6DB]"
      >
        <div className="p-5">
          {/* 지역 + 매물유형 */}
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs text-[#8B95A1]">
              {region} {subRegion}
            </span>
            {ptype !== 'apt' && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  TYPE_COLOR[ptype]
                )}
              >
                {TYPE_LABEL[ptype]}
              </span>
            )}
          </div>

          {/* 매물명 */}
          <h3 className="mb-1 line-clamp-2 text-base font-semibold leading-snug text-[#191F28]">
            {property.name}
          </h3>

          {/* 주소 */}
          <div className="mb-3 flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#8B95A1]" />
            <p className="line-clamp-1 text-sm text-[#8B95A1]">
              {property.address}
            </p>
          </div>

          {/* 구분선 */}
          <div className="my-3 border-t border-[#F2F4F6]" />

          {/* 상세 정보 */}
          <div className="flex items-center gap-4 text-sm text-[#4E5968]">
            {property.area_exclusive && (
              <div className="flex items-center gap-1.5">
                <Maximize2 className="h-3.5 w-3.5 text-[#8B95A1]" />
                {formatArea(property.area_exclusive)}
              </div>
            )}
            {property.built_year && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#8B95A1]" />
                {property.built_year}년
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
