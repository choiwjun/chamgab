'use client'

// @TASK P3-S4 - 매물 상세 클라이언트 컴포넌트
import { useState, useEffect } from 'react'
import { Heart, GitCompare, MapPin, Calendar, Ruler, Building } from 'lucide-react'
import { ChamgabCard } from '@/components/property/ChamgabCard'
import { PriceFactors } from '@/components/property/PriceFactors'
import { SimilarTransactions } from '@/components/property/SimilarTransactions'

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
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [factors, setFactors] = useState<Factor[]>([])
  const [similarTransactions, setSimilarTransactions] = useState<Transaction[]>([])
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
    <div className="min-h-screen bg-editorial-bg pb-24">
      {/* 헤더 섹션 - No Image, Editorial Style */}
      <div className="bg-white border-b border-editorial-dark/5">
        <div className="px-6 py-8">
          {/* 섹션 레이블 */}
          <div className="mb-6 flex items-center gap-3">
            <span className="w-8 h-px bg-editorial-gold" />
            <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              Property Detail
            </span>
          </div>

          {/* 타입 배지 */}
          <div className="mb-4 flex items-center gap-3">
            <span className="border border-editorial-gold/30 bg-editorial-gold/5 px-3 py-1.5 text-xs tracking-wider uppercase text-editorial-gold">
              {propertyTypeKo[property.property_type] || property.property_type}
            </span>
            {property.complexes?.brand && (
              <span className="border border-editorial-dark/10 px-3 py-1.5 text-xs tracking-wide text-editorial-ink/60">
                {property.complexes.brand}
              </span>
            )}
          </div>

          {/* 매물명 */}
          <h1 className="font-serif text-2xl md:text-3xl text-editorial-dark mb-3">
            {property.name}
          </h1>

          {/* 주소 */}
          <div className="flex items-center gap-2 text-editorial-ink/60">
            <MapPin className="h-4 w-4" />
            <span className="text-sm tracking-wide">{property.address}</span>
          </div>
        </div>

        {/* 상세 정보 그리드 */}
        <div className="border-t border-editorial-dark/5 grid grid-cols-3 divide-x divide-editorial-dark/5">
          {property.area_exclusive && (
            <div className="px-4 py-5 text-center">
              <Ruler className="mx-auto mb-2 h-4 w-4 text-editorial-gold" />
              <p className="text-lg font-serif text-editorial-dark">
                {property.area_exclusive}㎡
              </p>
              <p className="text-xs tracking-wide uppercase text-editorial-ink/50 mt-1">전용면적</p>
            </div>
          )}
          {property.built_year && (
            <div className="px-4 py-5 text-center">
              <Calendar className="mx-auto mb-2 h-4 w-4 text-editorial-gold" />
              <p className="text-lg font-serif text-editorial-dark">
                {property.built_year}
              </p>
              <p className="text-xs tracking-wide uppercase text-editorial-ink/50 mt-1">준공년도</p>
            </div>
          )}
          {property.floors && (
            <div className="px-4 py-5 text-center">
              <Building className="mx-auto mb-2 h-4 w-4 text-editorial-gold" />
              <p className="text-lg font-serif text-editorial-dark">
                {property.floors}F
              </p>
              <p className="text-xs tracking-wide uppercase text-editorial-ink/50 mt-1">층수</p>
            </div>
          )}
        </div>
      </div>

      {/* 참값 분석 카드 */}
      <div className="mt-px bg-white border-b border-editorial-dark/5">
        <div className="px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-8 h-px bg-editorial-gold" />
            <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              AI Analysis
            </span>
          </div>
          <ChamgabCard
            analysis={analysis || undefined}
            isLoading={isLoading}
            onRequestAnalysis={() => {
              // 분석 요청 로직
            }}
          />
        </div>
      </div>

      {/* 가격 요인 */}
      {factors.length > 0 && (
        <div className="mt-px bg-white border-b border-editorial-dark/5">
          <div className="px-6 py-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-px bg-editorial-gold" />
              <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
                Price Factors
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

      {/* 유사 거래 */}
      {similarTransactions.length > 0 && (
        <div className="mt-px bg-white border-b border-editorial-dark/5">
          <div className="px-6 py-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-px bg-editorial-gold" />
              <span className="text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
                Similar Transactions
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
      <div className="fixed bottom-0 left-0 right-0 border-t border-editorial-dark/10 bg-white px-6 py-4">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <button
            onClick={toggleFavorite}
            className={`flex h-12 w-12 items-center justify-center border transition-colors ${
              isFavorite
                ? 'border-editorial-gold bg-editorial-gold/10 text-editorial-gold'
                : 'border-editorial-dark/10 bg-white text-editorial-ink/40 hover:border-editorial-gold hover:text-editorial-gold'
            }`}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button className="flex h-12 w-12 items-center justify-center border border-editorial-dark/10 bg-white text-editorial-ink/40 hover:border-editorial-gold hover:text-editorial-gold transition-colors">
            <GitCompare className="h-5 w-5" />
          </button>
          <button className="flex-1 bg-editorial-dark py-3 text-sm tracking-widest uppercase text-white hover:bg-editorial-gold transition-colors">
            Contact
          </button>
        </div>
      </div>
    </div>
  )
}
