// @TASK P2-S3-T1 - 지도 페이지 라우트
// @SPEC specs/screens/search-map.yaml

'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { KakaoMap } from '@/components/map/KakaoMap';
import { PropertyPreview } from '@/components/map/PropertyPreview';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';
import { List } from 'lucide-react';

interface Property {
  id: string;
  name: string;
  address: string;
  property_type?: string;
  area_exclusive?: number;
  thumbnail?: string;
  location: {
    lat: number;
    lng: number;
  };
  chamgab_price?: number;
}

export default function SearchMapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isKakaoLoaded, setIsKakaoLoaded] = useState(false);

  // 필터 상태 (URL 쿼리 파라미터로부터)
  const region = searchParams.get('region');
  const type = searchParams.get('type');
  const priceMin = searchParams.get('price_min');
  const priceMax = searchParams.get('price_max');

  // 매물 조회
  const fetchProperties = useCallback(
    async (bounds?: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (bounds) params.set('bounds', bounds);
        if (region) params.set('region', region);
        if (type) params.set('type', type);
        if (priceMin) params.set('price_min', priceMin);
        if (priceMax) params.set('price_max', priceMax);
        params.set('limit', '100'); // 지도는 많은 마커 표시

        const response = await fetch(`/api/properties?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch properties');

        const data = await response.json();

        // location 파싱 (PostGIS POINT 형식)
        const parsedProperties = (data.items || []).map((item: any) => {
          // location이 "POINT(lng lat)" 형식이면 파싱
          let location = { lat: 37.5665, lng: 126.978 }; // 기본값

          if (item.location) {
            if (typeof item.location === 'string') {
              const match = item.location.match(
                /POINT\(([0-9.]+) ([0-9.]+)\)/
              );
              if (match) {
                location = {
                  lng: parseFloat(match[1]),
                  lat: parseFloat(match[2]),
                };
              }
            } else if (typeof item.location === 'object') {
              // 이미 객체 형태
              location = item.location;
            }
          }

          return {
            ...item,
            location,
          };
        });

        setProperties(parsedProperties);
      } catch (error) {
        console.error('Error fetching properties:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [region, type, priceMin, priceMax]
  );

  // 초기 로드
  useEffect(() => {
    if (isKakaoLoaded) {
      fetchProperties();
    }
  }, [isKakaoLoaded, fetchProperties]);

  // 지도 영역 변경 핸들러
  const handleBoundsChange = useCallback(
    (bounds: string) => {
      fetchProperties(bounds);
    },
    [fetchProperties]
  );

  // 마커 클릭 핸들러
  const handleMarkerClick = useCallback((property: Property) => {
    setSelectedProperty(property);
    setIsPreviewOpen(true);
  }, []);

  // 리스트 뷰로 전환
  const handleViewToggle = () => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (type) params.set('type', type);
    if (priceMin) params.set('price_min', priceMin);
    if (priceMax) params.set('price_max', priceMax);

    router.push(`/search?${params.toString()}`);
  };

  return (
    <>
      {/* Kakao Maps SDK 로드 */}
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false&libraries=clusterer`}
        strategy="beforeInteractive"
        onLoad={() => setIsKakaoLoaded(true)}
      />

      {/* 전체 화면 레이아웃 */}
      <div className="fixed inset-0 flex flex-col">
        {/* 상단 필터 오버레이 */}
        <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/30 to-transparent">
          <div className="bg-white rounded-lg shadow-lg px-4 py-2 flex items-center justify-between">
            <div className="flex gap-2 overflow-x-auto">
              {/* 간단한 필터 칩 */}
              {region && (
                <span className="px-3 py-1 bg-[#1E3A5F] text-white text-sm rounded-full">
                  {region}
                </span>
              )}
              {type && (
                <span className="px-3 py-1 bg-[#1E3A5F] text-white text-sm rounded-full">
                  {type}
                </span>
              )}
            </div>

            {/* 로딩 인디케이터 */}
            {isLoading && (
              <div className="text-sm text-gray-600">검색 중...</div>
            )}
          </div>
        </div>

        {/* 지도 */}
        <div className="flex-1">
          {isKakaoLoaded ? (
            <KakaoMap
              properties={properties}
              onBoundsChange={handleBoundsChange}
              onMarkerClick={handleMarkerClick}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100">
              <p className="text-gray-600">지도를 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* 리스트 뷰 전환 버튼 (FAB) */}
        <button
          onClick={handleViewToggle}
          className="
            fixed bottom-8 right-4 z-20
            flex items-center gap-2
            bg-[#1E3A5F] text-white
            px-4 py-3 rounded-full shadow-lg
            hover:bg-[#2E5A8F] transition-colors
            font-medium text-sm
          "
          aria-label="리스트로 보기"
        >
          <List className="w-5 h-5" />
          리스트로 보기
        </button>

        {/* 매물 프리뷰 (하단 시트) */}
        <PropertyPreview
          property={selectedProperty}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      </div>
    </>
  );
}
