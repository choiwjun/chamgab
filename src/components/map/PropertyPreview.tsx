// @TASK P2-S3-T3 - 매물 프리뷰 (하단 시트)
// @SPEC specs/screens/search-map.yaml

'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { MapPin, Home } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface Property {
  id: string;
  name: string;
  address: string;
  property_type?: string;
  area_exclusive?: number;
  thumbnail?: string;
  chamgab_price?: number;
}

interface PropertyPreviewProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apt: '아파트',
  officetel: '오피스텔',
  villa: '빌라/연립',
  store: '상가',
  land: '토지',
  building: '건물',
};

export function PropertyPreview({
  property,
  isOpen,
  onClose,
}: PropertyPreviewProps) {
  if (!property) return null;

  const propertyTypeLabel =
    PROPERTY_TYPE_LABELS[property.property_type || ''] || '매물';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} height="auto" draggable>
      <Link
        href={`/property/${property.id}`}
        className="block hover:bg-gray-50 transition-colors -mx-6 -my-4 px-6 py-4 rounded-t-2xl"
      >
        <div className="flex gap-4">
          {/* 썸네일 */}
          <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
            {property.thumbnail ? (
              <Image
                src={property.thumbnail}
                alt={property.name}
                fill
                className="object-cover"
                sizes="96px"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Home className="w-10 h-10 text-gray-400" />
              </div>
            )}
          </div>

          {/* 정보 */}
          <div className="flex-1 min-w-0">
            {/* 타입 */}
            <p className="text-xs text-gray-500 mb-1">{propertyTypeLabel}</p>

            {/* 이름 */}
            <h3 className="text-base font-semibold text-gray-900 mb-1 truncate">
              {property.name}
            </h3>

            {/* 주소 */}
            <div className="flex items-start gap-1 mb-2">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-600 line-clamp-2">
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
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">참값 분석가</p>
                <p className="text-lg font-bold text-[#1E3A5F]">
                  {(property.chamgab_price / 100000000).toFixed(1)}억 원
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-center text-sm font-medium text-[#1E3A5F]">
            상세 정보 보기 →
          </div>
        </div>
      </Link>
    </BottomSheet>
  );
}
