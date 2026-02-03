'use client'

// @TASK P2-S1-T4, P2-S2-T3 - 매물 카드 (홈/검색 화면 공유)
// @SPEC specs/screens/home.yaml#popular_properties
// @SPEC specs/screens/search-list.yaml

import Link from 'next/link'
import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Property } from '@/types/property'
import { formatArea } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PropertyCardProps {
  property: Property
  className?: string
  index?: number
}

export function PropertyCard({ property, className, index = 0 }: PropertyCardProps) {
  // Placeholder: 회색 배경 이미지 (실제 서비스에서는 Supabase Storage 이미지 사용)
  const thumbnail =
    property.thumbnail ||
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="192"%3E%3Crect width="320" height="192" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%239ca3af"%3ENo Image%3C/text%3E%3C/svg%3E'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn('group', className)}
    >
      <Link
        href={`/property/${property.id}`}
        className="block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:border-primary hover:shadow-md"
      >
      {/* 이미지 */}
      <div className="relative h-48 w-full overflow-hidden bg-gray-100">
        <Image
          src={thumbnail}
          alt={property.name}
          fill
          unoptimized={!property.thumbnail}
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 280px, 320px"
        />
      </div>

      {/* 정보 */}
      <div className="p-4">
        {/* 이름 */}
        <h3 className="mb-2 text-base font-semibold text-gray-900 line-clamp-1 group-hover:text-primary">
          {property.name}
        </h3>

        {/* 주소 */}
        <div className="mb-3 flex items-start gap-1">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
          <p className="text-sm text-gray-600 line-clamp-2">
            {property.address}
          </p>
        </div>

        {/* 상세 정보 */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {property.area_exclusive && (
            <span>{formatArea(property.area_exclusive)}</span>
          )}
          {property.built_year && (
            <>
              <span>•</span>
              <span>{property.built_year}년</span>
            </>
          )}
        </div>
      </div>
      </Link>
    </motion.div>
  )
}
