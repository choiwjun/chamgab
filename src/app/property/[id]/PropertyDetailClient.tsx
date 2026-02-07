'use client'

// @TASK P3-S4 - 매물 상세 클라이언트 컴포넌트
import { useState, useEffect } from 'react'
import {
  Heart,
  GitCompare,
  MapPin,
  Calendar,
  Ruler,
  Building,
} from 'lucide-react'
import { ChamgabCard } from '@/components/property/ChamgabCard'
import { PriceFactors } from '@/components/property/PriceFactors'
import { SimilarTransactions } from '@/components/property/SimilarTransactions'
import { InvestmentScore } from '@/components/property/InvestmentScore'

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
  complexes?: { brand?: string }
}

interface PropertyDetailClientProps {
  property: Property
}

interface Analysis {
  chamgab_price: number
  min_price: number
  max_price: number
  confidence: number
  analyzed_at: string
  expires_at: string
  id?: string
}

interface Factor {
  id: string
  rank: number
  factor_name: string
  factor_name_ko: string
  contribution: number
  direction: 'positive' | 'negative'
}

interface Transaction {
  id: string
  transaction_date: string
  price: number
  area_exclusive?: number
  floor?: number
  dong?: string
  similarity?: number
}

export function PropertyDetailClient({ property }: PropertyDetailClientProps) {
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [factors, setFactors] = useState<Factor[]>([])
  const [similarTransactions, setSimilarTransactions] = useState<Transaction[]>(
    []
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isRequesting, setIsRequesting] = useState(false)

  // 분석 요청
  const handleRequestAnalysis = async () => {
    setIsRequesting(true)
    try {
      const res = await fetch('/api/chamgab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: property.id }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Analysis request failed')
      }

      const result = await res.json()
      if (result.analysis) {
        setAnalysis(result.analysis)

        // 분석 결과에 ID가 있으면 가격 요인도 조회
        if (result.analysis.id) {
          const factorsRes = await fetch(
            `/api/chamgab/${result.analysis.id}/factors?limit=10`
          )
          if (factorsRes.ok) {
            const factorsData = await factorsRes.json()
            setFactors(factorsData.factors || [])
          }
        }
      }
    } catch (error) {
      console.error('Analysis request failed:', error)
      alert('분석 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsRequesting(false)
    }
  }

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

        // 관심 매물 여부 확인 (비로그인 시 건너뜀)
        try {
          const favRes = await fetch('/api/favorites')
          if (favRes.ok) {
            const favData = await favRes.json()
            const found = (favData.items || []).find(
              (f: { property_id: string; id: string }) =>
                f.property_id === property.id
            )
            if (found) {
              setIsFavorite(true)
              setFavoriteId(found.id)
            }
          }
          // 401은 비로그인 상태 - 정상
        } catch {
          // 네트워크 에러 무시
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
    try {
      if (isFavorite && favoriteId) {
        setIsFavorite(false)
        await fetch(`/api/favorites/${favoriteId}`, { method: 'DELETE' })
        setFavoriteId(null)
      } else {
        setIsFavorite(true)
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: property.id }),
        })
        if (res.ok) {
          const data = await res.json()
          setFavoriteId(data.favorite?.id || null)
        }
      }
    } catch {
      setIsFavorite(!isFavorite)
    }
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
    <div className="min-h-screen bg-white pb-24">
      {/* 헤더 섹션 */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 py-8">
          {/* 섹션 레이블 */}
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-blue-500" />
            <span className="text-xs font-medium tracking-wide text-gray-500">
              매물 상세정보
            </span>
          </div>

          {/* 타입 배지 */}
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-lg border border-blue-500/20 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600">
              {propertyTypeKo[property.property_type] || property.property_type}
            </span>
            {property.complexes?.brand && (
              <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
                {property.complexes.brand}
              </span>
            )}
          </div>

          {/* 매물명 */}
          <h1 className="mb-3 text-2xl font-bold text-[#191F28] md:text-3xl">
            {property.name}
          </h1>

          {/* 주소 */}
          <div className="flex items-center gap-2 text-[#4E5968]">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">{property.address}</span>
          </div>
        </div>

        {/* 상세 정보 그리드 */}
        <div className="grid grid-cols-3 divide-x divide-gray-200 border-t border-gray-200">
          {property.area_exclusive && (
            <div className="px-4 py-5 text-center">
              <Ruler className="mx-auto mb-2 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-[#191F28]">
                {property.area_exclusive}㎡
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">전용면적</p>
            </div>
          )}
          {property.built_year && (
            <div className="px-4 py-5 text-center">
              <Calendar className="mx-auto mb-2 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-[#191F28]">
                {property.built_year}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">준공년도</p>
            </div>
          )}
          {property.floors && (
            <div className="px-4 py-5 text-center">
              <Building className="mx-auto mb-2 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-[#191F28]">
                {property.floors}F
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">층수</p>
            </div>
          )}
        </div>
      </div>

      {/* 참값 분석 카드 */}
      <div className="mt-2 border-b border-gray-200 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-blue-500" />
            <span className="text-xs font-medium tracking-wide text-gray-500">
              AI 분석
            </span>
          </div>
          <ChamgabCard
            analysis={analysis || undefined}
            isLoading={isLoading || isRequesting}
            onRequestAnalysis={handleRequestAnalysis}
          />
        </div>
      </div>

      {/* 가격 요인 */}
      {factors.length > 0 && (
        <div className="mt-2 border-b border-gray-200 bg-white">
          <div className="px-6 py-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-500" />
              <span className="text-xs font-medium tracking-wide text-gray-500">
                가격 영향 요인
              </span>
            </div>
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
        </div>
      )}

      {/* 투자 점수 */}
      <div className="mt-2 border-b border-gray-200 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-blue-500" />
            <span className="text-xs font-medium tracking-wide text-gray-500">
              투자 분석
            </span>
          </div>
          <InvestmentScore propertyId={property.id} />
        </div>
      </div>

      {/* 유사 거래 */}
      {similarTransactions.length > 0 && (
        <div className="mt-2 border-b border-gray-200 bg-white">
          <div className="px-6 py-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-500" />
              <span className="text-xs font-medium tracking-wide text-gray-500">
                유사 거래 내역
              </span>
            </div>
            <SimilarTransactions
              transactions={similarTransactions}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* 하단 CTA 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-6 py-4 shadow-lg">
        <div className="mx-auto flex max-w-2xl gap-3">
          <button
            onClick={toggleFavorite}
            className={`flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${
              isFavorite
                ? 'border-blue-500 bg-blue-50 text-blue-600'
                : 'border-gray-200 bg-white text-gray-400 hover:border-blue-500 hover:text-blue-600'
            }`}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:border-blue-500 hover:text-blue-600">
            <GitCompare className="h-5 w-5" />
          </button>
          <button className="flex-1 rounded-lg bg-blue-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1B64DA]">
            문의하기
          </button>
        </div>
      </div>
    </div>
  )
}
