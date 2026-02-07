// @TASK P2-S3-T3 - 매물 프리뷰 (하단 시트)
// @SPEC specs/screens/search-map.yaml

'use client'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { MapPin, Home } from 'lucide-react'
import Link from 'next/link'

interface Property {
  id: string
  name: string
  address: string
  property_type?: string
  area_exclusive?: number
  thumbnail?: string
  chamgab_price?: number
}

interface PropertyPreviewProps {
  property: Property | null
  isOpen: boolean
  onClose: () => void
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apt: '아파트',
  officetel: '오피스텔',
  villa: '빌라/연립',
  store: '상가',
  land: '토지',
  building: '건물',
}

export function PropertyPreview({
  property,
  isOpen,
  onClose,
}: PropertyPreviewProps) {
  if (!property) return null

  const propertyTypeLabel =
    PROPERTY_TYPE_LABELS[property.property_type || ''] || '매물'

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} height="auto" draggable>
      <Link
        href={`/property/${property.id}`}
        className="-mx-6 -my-4 block rounded-t-2xl px-6 py-4 transition-colors hover:bg-gray-50"
      >
        <div className="flex gap-4">
          {/* 아이콘 */}
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-[#F0F0EE]">
            <Home className="h-6 w-6 text-[#767676]" />
          </div>

          {/* 정보 */}
          <div className="min-w-0 flex-1">
            {/* 타입 */}
            <p className="mb-1 text-xs text-gray-500">{propertyTypeLabel}</p>

            {/* 이름 */}
            <h3 className="mb-1 truncate text-base font-semibold text-gray-900">
              {property.name}
            </h3>

            {/* 주소 */}
            <div className="mb-2 flex items-start gap-1">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <p className="line-clamp-2 text-sm text-gray-600">
                {property.address}
              </p>
            </div>

            {/* 면적 */}
            {property.area_exclusive && (
              <p className="text-sm text-gray-600">
                전용면적 {property.area_exclusive.toFixed(2)}㎡ (
                {(property.area_exclusive / 3.3058).toFixed(1)}평)
              </p>
            )}

            {/* 참값 (있으면 표시) */}
            {property.chamgab_price && (
              <div className="mt-2 border-t border-gray-200 pt-2">
                <p className="text-xs text-gray-500">참값 분석가</p>
                <p className="text-lg font-bold text-[#191F28]">
                  {(property.chamgab_price / 100000000).toFixed(1)}억 원
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="text-center text-sm font-medium text-[#191F28]">
            상세 정보 보기 →
          </div>
        </div>
      </Link>
    </BottomSheet>
  )
}
