'use client'

// @TASK P3-S4 - 매물 상세 클라이언트 컴포넌트
import { useState, useEffect } from 'react'
import { Heart, GitCompare, MapPin, Calendar, Ruler, Building } from 'lucide-react'
import { ImageGallery } from '@/components/property/ImageGallery'
import { ChamgabCard } from '@/components/property/ChamgabCard'
import { PriceFactors } from '@/components/property/PriceFactors'
import { SimilarTransactions } from '@/components/property/SimilarTransactions'
import { formatPrice } from '@/lib/format'

interface Property {
  id: string
  name: string
  address: string
  property_type: string
  sido?: string
  sigungu?: string
  eupmyeondong?: string
  area_exclusive?: number
  built_year?: number
  floors?: number
  thumbnail?: string | null
  images?: string[]
  complex_id?: string | null
  created_at: string
  complexes?: any
}

interface PropertyDetailClientProps {
  property: Property
}

export function PropertyDetailClient({ property }: PropertyDetailClientProps) {
  const [isFavorite, setIsFavorite] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)
  const [factors, setFactors] = useState<any[]>([])
  const [similarTransactions, setSimilarTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 데이터 로드
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        // 참값 분석 조회
        const analysisRes = await fetch(`/api/chamgab/${property.id}`)
        if (analysisRes.ok) {
          const analysisData = await analysisRes.json()
          setAnalysis(analysisData.analysis)

          // 가격 요인 조회
          if (analysisData.analysis?.id) {
            const factorsRes = await fetch(
              `/api/chamgab/${analysisData.analysis.id}/factors?limit=10`
            )
            if (factorsRes.ok) {
              const factorsData = await factorsRes.json()
              setFactors(factorsData.factors || [])
            }
          }
        }

        // 유사 거래 조회
        const similarRes = await fetch(`/api/properties/${property.id}/similar`)
        if (similarRes.ok) {
          const similarData = await similarRes.json()
          setSimilarTransactions(similarData.transactions || [])
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [property.id])

  // 관심 매물 토글
  const toggleFavorite = async () => {
    setIsFavorite(!isFavorite)
    // TODO: API 연동
  }

  // 매물 유형 한글 변환
  const propertyTypeKo: Record<string, string> = {
    apt: '아파트',
    officetel: '오피스텔',
    villa: '빌라',
    store: '상가',
    land: '토지',
    building: '빌딩',
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 이미지 갤러리 */}
      <div className="bg-white px-4 py-4">
        <ImageGallery
          images={property.images || []}
          alt={property.name}
        />
      </div>

      {/* 기본 정보 */}
      <div className="bg-white px-4 py-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {propertyTypeKo[property.property_type] || property.property_type}
          </span>
          {property.complexes?.brand && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {property.complexes.brand}
            </span>
          )}
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-900">{property.name}</h1>

        <div className="mb-4 flex items-center gap-1 text-gray-500">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">{property.address}</span>
        </div>

        {/* 상세 정보 그리드 */}
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
          {property.area_exclusive && (
            <div className="text-center">
              <Ruler className="mx-auto mb-1 h-5 w-5 text-gray-400" />
              <p className="text-sm font-semibold text-gray-900">
                {property.area_exclusive}㎡
              </p>
              <p className="text-xs text-gray-500">전용면적</p>
            </div>
          )}
          {property.built_year && (
            <div className="text-center">
              <Calendar className="mx-auto mb-1 h-5 w-5 text-gray-400" />
              <p className="text-sm font-semibold text-gray-900">
                {property.built_year}년
              </p>
              <p className="text-xs text-gray-500">준공년도</p>
            </div>
          )}
          {property.floors && (
            <div className="text-center">
              <Building className="mx-auto mb-1 h-5 w-5 text-gray-400" />
              <p className="text-sm font-semibold text-gray-900">
                {property.floors}층
              </p>
              <p className="text-xs text-gray-500">층수</p>
            </div>
          )}
        </div>
      </div>

      {/* 참값 분석 카드 */}
      <div className="mt-2 bg-white px-4 py-6">
        <ChamgabCard
          analysis={analysis}
          isLoading={isLoading}
          onRequestAnalysis={() => {
            // 분석 요청 로직
          }}
        />
      </div>

      {/* 가격 요인 */}
      {factors.length > 0 && (
        <div className="mt-2 bg-white px-4 py-6">
          <PriceFactors
            factors={factors}
            maxVisible={5}
            isPremium={false}
            isLoading={isLoading}
            onUpgrade={() => {
              // 업그레이드 로직
            }}
          />
        </div>
      )}

      {/* 유사 거래 */}
      {similarTransactions.length > 0 && (
        <div className="mt-2 bg-white px-4 py-6">
          <SimilarTransactions
            transactions={similarTransactions}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* 하단 CTA 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex gap-3">
          <button
            onClick={toggleFavorite}
            className={`flex h-12 w-12 items-center justify-center rounded-lg border ${
              isFavorite
                ? 'border-red-200 bg-red-50 text-red-500'
                : 'border-gray-200 bg-white text-gray-400'
            }`}
          >
            <Heart className={`h-6 w-6 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400">
            <GitCompare className="h-6 w-6" />
          </button>
          <button className="flex-1 rounded-lg bg-primary py-3 font-semibold text-white hover:bg-primary/90">
            문의하기
          </button>
        </div>
      </div>
    </div>
  )
}
