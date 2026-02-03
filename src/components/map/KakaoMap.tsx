// @TASK P2-S3-T2 - 지도 컴포넌트
// @SPEC specs/screens/search-map.yaml

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createMarkerContent,
  getClustererStyles,
  getClustererCalculator,
} from '@/lib/kakao-marker-utils';

interface Property {
  id: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  thumbnail?: string;
  area_exclusive?: number;
}

interface KakaoMapProps {
  properties: Property[];
  onBoundsChange?: (bounds: string) => void;
  onMarkerClick?: (property: Property) => void;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
}

export function KakaoMap({
  properties,
  onBoundsChange,
  onMarkerClick,
  initialCenter = { lat: 37.5665, lng: 126.978 }, // 서울시청
  initialZoom = 13,
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<kakao.maps.Map | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current || isMapReady) return;

    const initializeMap = () => {
      if (!window.kakao || !window.kakao.maps) {
        console.error('Kakao Maps SDK not loaded');
        return;
      }

      window.kakao.maps.load(() => {
        const container = mapRef.current;
        if (!container) return;

        const options = {
          center: new window.kakao.maps.LatLng(
            initialCenter.lat,
            initialCenter.lng
          ),
          level: initialZoom,
        };

        const map = new window.kakao.maps.Map(container, options);
        kakaoMapRef.current = map;

        // 클러스터러 초기화
        const clusterer = new window.kakao.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 10,
          disableClickZoom: true,
          styles: getClustererStyles(),
          calculator: getClustererCalculator,
        });
        clustererRef.current = clusterer;

        // 지도 이동/줌 이벤트 리스너
        window.kakao.maps.event.addListener(map, 'idle', () => {
          if (onBoundsChange) {
            const bounds = map.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            const boundsString = `${sw.getLat()},${sw.getLng()},${ne.getLat()},${ne.getLng()}`;
            onBoundsChange(boundsString);
          }
        });

        setIsMapReady(true);
      });
    };

    initializeMap();
  }, [initialCenter, initialZoom, isMapReady, onBoundsChange]);

  // 마커 업데이트
  useEffect(() => {
    if (!kakaoMapRef.current || !clustererRef.current || !isMapReady) return;

    const map = kakaoMapRef.current;
    const clusterer = clustererRef.current;

    // 기존 마커 제거
    clusterer.clear();
    markersRef.current = [];

    // 새 마커 생성
    const newMarkers = properties.map((property) => {
      // location이 없는 경우 스킵
      if (!property.location) return null;

      const position = new window.kakao.maps.LatLng(
        property.location.lat,
        property.location.lng
      );

      // 기본 마커 사용 (클러스터링 호환성)
      const marker = new window.kakao.maps.Marker({
        position,
        clickable: true,
      });

      // 마커 클릭 이벤트
      window.kakao.maps.event.addListener(marker, 'click', () => {
        if (onMarkerClick) {
          onMarkerClick(property);
        }
      });

      return marker;
    }).filter(Boolean) as kakao.maps.Marker[];

    markersRef.current = newMarkers;

    // 클러스터러에 마커 추가
    if (newMarkers.length > 0) {
      clusterer.addMarkers(newMarkers);
    }
  }, [properties, isMapReady, onMarkerClick]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />

      {/* 로딩 상태 */}
      {!isMapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <p className="text-gray-600">지도를 불러오는 중...</p>
        </div>
      )}
    </div>
  );
}
