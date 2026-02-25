'use client'

// @TASK P3-S4 - 留ㅻЪ ?곸꽭 ?대씪?댁뼵??而댄룷?뚰듃
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
import type { ChamgabQuality } from '@/types/chamgab'

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
  const [analysisQuality, setAnalysisQuality] = useState<ChamgabQuality | null>(
    null
  )
  const [analysisGateStatus, setAnalysisGateStatus] = useState<
    'pass' | 'warn' | 'fail' | null
  >(null)
  const [analysisGrade, setAnalysisGrade] = useState<
    'A' | 'B' | 'C' | 'D' | null
  >(null)
  const [analysisFlags, setAnalysisFlags] = useState<string[]>([])
  const [factors, setFactors] = useState<Factor[]>([])
  const [similarTransactions, setSimilarTransactions] = useState<Transaction[]>(
    []
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isRequesting, setIsRequesting] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // 遺꾩꽍 ?붿껌
  const handleRequestAnalysis = async () => {
    setIsRequesting(true)
    setAnalysisError(null)
    try {
      const res = await fetch('/api/chamgab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: property.id }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const errorCode =
          typeof err?.code === 'string' && err.code.trim().length > 0
            ? err.code
            : null
        const serverMessage =
          typeof err?.error === 'string' && err.error.trim().length > 0
            ? err.error
            : null
        const messageByCode =
          errorCode === 'AUTH_REQUIRED'
            ? '濡쒓렇?몄씠 ?꾩슂??湲곕뒫?낅땲?? 濡쒓렇?????ㅼ떆 ?쒕룄?댁＜?몄슂.'
            : errorCode === 'ANON_QUOTA_EXCEEDED'
              ? '鍮꾨줈洹몄씤 ?댁슜 ?쒕룄瑜?珥덇낵?덉뒿?덈떎. 濡쒓렇????怨꾩냽 ?댁슜?댁＜?몄슂.'
              : errorCode === 'CREDITS_EXCEEDED' ||
                  errorCode === 'insufficient_credits'
                ? '?щ젅?㏃씠 遺議깊빀?덈떎. ?뚮옖???뺤씤?댁＜?몄슂.'
                : null
        const fallbackMessage =
          res.status === 401
            ? '濡쒓렇?몄씠 ?꾩슂??湲곕뒫?낅땲?? 濡쒓렇?????ㅼ떆 ?쒕룄?댁＜?몄슂.'
            : res.status === 429
              ? '?붿껌 ?쒕룄瑜?珥덇낵?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.'
              : 'Analysis request failed'
        throw new Error(messageByCode || serverMessage || fallbackMessage)
      }

      const result = await res.json()
      if (result.analysis) {
        setAnalysis(result.analysis)
        setAnalysisQuality(result.quality || null)
        setAnalysisGateStatus(result.quality_gate_status || null)
        setAnalysisGrade(result.quality_grade || null)
        setAnalysisFlags(
          result.quality_flags || result.quality?.quality_flags || []
        )

        // 遺꾩꽍 寃곌낵??ID媛 ?덉쑝硫?媛寃??붿씤??議고쉶
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
      if (error instanceof Error && error.message) {
        setAnalysisError(error.message)
        return
      }
      setAnalysisError(
        '遺꾩꽍 ?붿껌 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.'
      )
    } finally {
      setIsRequesting(false)
    }
  }

  // ?곗씠??濡쒕뱶
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setAnalysis(null)
      setAnalysisQuality(null)
      setAnalysisGateStatus(null)
      setAnalysisGrade(null)
      setAnalysisFlags([])
      setFactors([])
      try {
        // 李멸컪 遺꾩꽍 議고쉶
        const analysisRes = await fetch(`/api/chamgab/${property.id}`)
        if (analysisRes.ok) {
          const analysisData = await analysisRes.json()
          setAnalysis(analysisData.analysis || null)
          setAnalysisQuality(analysisData.quality || null)
          setAnalysisGateStatus(analysisData.quality_gate_status || null)
          setAnalysisGrade(analysisData.quality_grade || null)
          setAnalysisFlags(
            analysisData.quality_flags ||
              analysisData.quality?.quality_flags ||
              []
          )

          // 媛寃??붿씤 議고쉶
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

        // ?좎궗 嫄곕옒 議고쉶
        const similarRes = await fetch(`/api/properties/${property.id}/similar`)
        if (similarRes.ok) {
          const similarData = await similarRes.json()
          setSimilarTransactions(similarData.transactions || [])
        }

        // 愿??留ㅻЪ ?щ? ?뺤씤 (鍮꾨줈洹몄씤 ??嫄대꼫?)
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
          // 401? 鍮꾨줈洹몄씤 ?곹깭 - ?뺤긽
        } catch {
          // ?ㅽ듃?뚰겕 ?먮윭 臾댁떆
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [property.id])

  // 愿??留ㅻЪ ?좉?
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

  // 留ㅻЪ ?좏삎 ?쒓? 蹂??
  const propertyTypeKo: Record<string, string> = {
    apt: 'Apartment',
    officetel: 'Officetel',
    villa: 'Villa',
    store: 'Store',
    land: 'Land',
    building: 'Building',
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* ?ㅻ뜑 ?뱀뀡 */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 py-8">
          {/* ?뱀뀡 ?덉씠釉?*/}
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-blue-500" />
            <span className="text-xs font-medium tracking-wide text-gray-500">
              留ㅻЪ ?곸꽭?뺣낫
            </span>
          </div>

          {/* ???諛곗? */}
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

          {/* 留ㅻЪ紐?*/}
          <h1 className="mb-3 text-2xl font-bold text-[#191F28] md:text-3xl">
            {property.name}
          </h1>

          {/* 二쇱냼 */}
          <div className="flex items-center gap-2 text-[#4E5968]">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">{property.address}</span>
          </div>
        </div>

        {/* ?곸꽭 ?뺣낫 洹몃━??*/}
        <div className="grid grid-cols-3 divide-x divide-gray-200 border-t border-gray-200">
          {property.area_exclusive && (
            <div className="px-4 py-5 text-center">
              <Ruler className="mx-auto mb-2 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-[#191F28]">
                {property.area_exclusive}??
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">?꾩슜硫댁쟻</p>
            </div>
          )}
          {property.built_year && (
            <div className="px-4 py-5 text-center">
              <Calendar className="mx-auto mb-2 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-[#191F28]">
                {property.built_year}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">
                Built year
              </p>
            </div>
          )}
          {property.floors && (
            <div className="px-4 py-5 text-center">
              <Building className="mx-auto mb-2 h-4 w-4 text-blue-500" />
              <p className="text-lg font-bold text-[#191F28]">
                {property.floors}F
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">痢듭닔</p>
            </div>
          )}
        </div>
      </div>

      {/* 李멸컪 遺꾩꽍 移대뱶 */}
      <div className="mt-2 border-b border-gray-200 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-blue-500" />
            <span className="text-xs font-medium tracking-wide text-gray-500">
              AI 遺꾩꽍
            </span>
          </div>
          {analysisError && (
            <div className="mb-4 rounded-xl border border-[#F04452]/20 bg-red-50 px-4 py-3">
              <p className="text-sm text-[#F04452]">{analysisError}</p>
            </div>
          )}
          <ChamgabCard
            analysis={analysis || undefined}
            quality={analysisQuality || undefined}
            qualityGateStatus={analysisGateStatus || undefined}
            qualityGrade={analysisGrade || undefined}
            qualityFlags={analysisFlags}
            isLoading={isLoading || isRequesting}
            onRequestAnalysis={handleRequestAnalysis}
          />
        </div>
      </div>

      {/* 媛寃??붿씤 */}
      {factors.length > 0 && (
        <div className="mt-2 border-b border-gray-200 bg-white">
          <div className="px-6 py-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-500" />
              <span className="text-xs font-medium tracking-wide text-gray-500">
                媛寃??곹뼢 ?붿씤
              </span>
            </div>
            <PriceFactors
              factors={factors}
              maxVisible={5}
              isPremium={false}
              isLoading={isLoading}
              onUpgrade={() => {
                // ?낃렇?덉씠??濡쒖쭅
              }}
            />
          </div>
        </div>
      )}

      {/* ?ъ옄 ?먯닔 */}
      <div className="mt-2 border-b border-gray-200 bg-white">
        <div className="px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-blue-500" />
            <span className="text-xs font-medium tracking-wide text-gray-500">
              ?ъ옄 遺꾩꽍
            </span>
          </div>
          <InvestmentScore propertyId={property.id} />
        </div>
      </div>

      {/* ?좎궗 嫄곕옒 */}
      {similarTransactions.length > 0 && (
        <div className="mt-2 border-b border-gray-200 bg-white">
          <div className="px-6 py-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-blue-500" />
              <span className="text-xs font-medium tracking-wide text-gray-500">
                ?좎궗 嫄곕옒 ?댁뿭
              </span>
            </div>
            <SimilarTransactions
              transactions={similarTransactions}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* ?섎떒 CTA 踰꾪듉 */}
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
            臾몄쓽?섍린
          </button>
        </div>
      </div>
    </div>
  )
}
