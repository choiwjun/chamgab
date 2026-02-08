// 지도 검색 페이지 - 단지(complexes) 기반

'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { KakaoMap } from '@/components/map/KakaoMap'
import { PropertyPreview } from '@/components/map/PropertyPreview'
import { useRouter, useSearchParams } from 'next/navigation'
import { List } from 'lucide-react'
import { findRegionCenter, expandCityToDistricts } from '@/lib/region-coords'

interface MapComplex {
  id: string
  name: string
  address: string
  sigungu?: string
  built_year?: number
  total_units?: number
  location: { lat: number; lng: number }
}

function SearchMapContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [complexes, setComplexes] = useState<MapComplex[]>([])
  const [selectedComplex, setSelectedComplex] = useState<MapComplex | null>(
    null
  )
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [isKakaoLoaded, setIsKakaoLoaded] = useState(false)

  // 필터 상태 (URL 쿼리 파라미터로부터)
  const q = searchParams.get('q')
  const region = searchParams.get('region')
  const sigungu = searchParams.get('sigungu')
  const sido = searchParams.get('sido')

  // 검색어 기반 지도 초기 중심 좌표
  const mapCenter = useMemo(() => {
    const query = sigungu || q || region || sido || ''
    return findRegionCenter(query) || { lat: 37.5665, lng: 126.978 }
  }, [sigungu, q, region, sido])

  // 검색 지역 유형에 따른 줌 레벨 결정
  const mapZoom = useMemo(() => {
    const query = sigungu || q || region || ''
    if (!query && !sido) return 13

    // 시도만 선택된 경우 넓은 줌
    if (sido && !sigungu && !q) return 10

    const sidoKeywords = [
      '서울',
      '경기',
      '인천',
      '부산',
      '대구',
      '광주',
      '대전',
      '울산',
      '세종',
      '충북',
      '충남',
      '전북',
      '전남',
      '경북',
      '경남',
      '제주',
      '강원',
    ]
    if (sidoKeywords.some((k) => query.includes(k))) return 10
    if (expandCityToDistricts(query).length > 0) return 8
    return 6
  }, [sigungu, q, region, sido])

  // 단지 데이터 조회
  const fetchComplexes = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('map', 'true')
      if (q) params.set('keyword', q)
      if (sido) params.set('sido', sido)
      if (sigungu) params.set('sigungu', sigungu)

      const response = await fetch(`/api/complexes?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch complexes')

      const data = await response.json()
      const items: MapComplex[] = (data.items || []).filter(
        (item: MapComplex) => item.location?.lat && item.location?.lng
      )

      setComplexes(items)
      setTotalCount(data.total || 0)
    } catch (error) {
      console.error('Error fetching complexes:', error)
    } finally {
      setIsLoading(false)
    }
  }, [q, sido, sigungu])

  // Kakao Maps SDK 동적 로드
  useEffect(() => {
    if (window.kakao?.maps) {
      setIsKakaoLoaded(true)
      return
    }

    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!kakaoKey) {
      console.error('NEXT_PUBLIC_KAKAO_MAP_KEY is not defined')
      return
    }

    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&autoload=false&libraries=clusterer,services`
    script.async = true

    script.onload = () => {
      window.kakao.maps.load(() => {
        setIsKakaoLoaded(true)
      })
    }

    script.onerror = (e) => {
      console.error('Kakao Maps SDK load error:', e)
    }

    document.head.appendChild(script)
  }, [])

  // 초기 로드
  useEffect(() => {
    if (isKakaoLoaded) {
      fetchComplexes()
    }
  }, [isKakaoLoaded, fetchComplexes])

  // 마커 클릭 핸들러
  const handleMarkerClick = useCallback((item: MapComplex) => {
    setSelectedComplex(item)
    setIsPreviewOpen(true)
  }, [])

  // 리스트 뷰로 전환
  const handleViewToggle = () => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (region) params.set('region', region)
    if (sido) params.set('sido', sido)
    if (sigungu) params.set('sigungu', sigungu)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/search?${params.toString()}` as any)
  }

  return (
    <>
      <div className="fixed inset-0 flex flex-col">
        {/* 상단 필터 오버레이 */}
        <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/30 to-transparent p-4">
          <div className="flex items-center justify-between rounded-xl bg-white px-4 py-2 shadow-sm">
            <div className="flex gap-2 overflow-x-auto">
              {(q || sigungu || sido || region) && (
                <span className="rounded-full bg-blue-500 px-3 py-1 text-sm text-white">
                  {sigungu || q || sido || region}
                </span>
              )}
              {!isLoading && complexes.length > 0 && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                  {totalCount.toLocaleString()}개 단지
                </span>
              )}
            </div>
            {isLoading && (
              <div className="text-sm text-gray-600">검색 중...</div>
            )}
          </div>
        </div>

        {/* 지도 */}
        <div className="flex-1">
          {isKakaoLoaded ? (
            <KakaoMap
              properties={complexes}
              onMarkerClick={handleMarkerClick}
              initialCenter={mapCenter}
              initialZoom={mapZoom}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gray-100">
              <p className="text-gray-600">지도를 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* 리스트 뷰 전환 버튼 */}
        <button
          onClick={handleViewToggle}
          className="fixed bottom-8 right-4 z-20 flex items-center gap-2 rounded-full bg-blue-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600"
          aria-label="리스트로 보기"
        >
          <List className="h-5 w-5" />
          리스트로 보기
        </button>

        {/* 단지 프리뷰 (하단 시트) */}
        <PropertyPreview
          property={selectedComplex}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      </div>
    </>
  )
}

function MapLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
      <p className="text-gray-600">지도를 불러오는 중...</p>
    </div>
  )
}

export default function SearchMapPage() {
  return (
    <Suspense fallback={<MapLoading />}>
      <SearchMapContent />
    </Suspense>
  )
}
