// 지도 마커 클릭 시 프리뷰 (하단 시트)

'use client'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { MapPin, Building, Calendar } from 'lucide-react'
import Link from 'next/link'

interface MapItem {
  id: string
  name: string
  address: string
  sigungu?: string
  built_year?: number
  total_units?: number
}

interface PropertyPreviewProps {
  property: MapItem | null
  isOpen: boolean
  onClose: () => void
}

export function PropertyPreview({
  property,
  isOpen,
  onClose,
}: PropertyPreviewProps) {
  if (!property) return null

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} height="auto" draggable>
      <Link
        href={`/complex/${property.id}`}
        className="-mx-6 -my-4 block rounded-t-2xl px-6 py-4 transition-colors hover:bg-gray-50"
      >
        <div className="flex gap-4">
          {/* 아이콘 */}
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Building className="h-6 w-6 text-blue-500" />
          </div>

          {/* 정보 */}
          <div className="min-w-0 flex-1">
            {/* 지역 */}
            <p className="mb-1 text-xs font-medium text-blue-500">
              {property.sigungu || ''}
            </p>

            {/* 단지명 */}
            <h3 className="mb-1 truncate text-base font-semibold text-gray-900">
              {property.name}
            </h3>

            {/* 주소 */}
            <div className="mb-2 flex items-start gap-1">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <p className="line-clamp-2 text-sm text-gray-500">
                {property.address}
              </p>
            </div>

            {/* 세대수 + 건축연도 */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {property.total_units && (
                <span>{property.total_units.toLocaleString()}세대</span>
              )}
              {property.built_year && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {property.built_year}년
                </span>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="text-center text-sm font-medium text-blue-500">
            참값 분석 보기 →
          </div>
        </div>
      </Link>
    </BottomSheet>
  )
}
