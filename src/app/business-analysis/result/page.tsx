'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Share2, Download } from 'lucide-react'
import { SuccessProbabilityCard } from '@/components/business/SuccessProbabilityCard'
import { DistrictCharacteristicsCard } from '@/components/business/DistrictCharacteristicsCard'
import { MetricsCard } from '@/components/business/MetricsCard'
import {
  predictBusinessSuccess,
  getDistrictCharacteristics,
  getDistrictDetail,
  getDistricts,
  getIndustries,
  APIError,
} from '@/lib/api/commercial'
import type {
  BusinessPredictionResult,
  DistrictCharacteristics,
  DistrictDetail,
  DistrictBasic,
  Industry,
} from '@/types/commercial'

export default function BusinessAnalysisResultPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const districtCode = searchParams.get('district')
  const industryCode = searchParams.get('industry')

  const [prediction, setPrediction] = useState<BusinessPredictionResult | null>(null)
  const [characteristics, setCharacteristics] = useState<DistrictCharacteristics | null>(null)
  const [districtDetail, setDistrictDetail] = useState<DistrictDetail | null>(null)
  const [district, setDistrict] = useState<DistrictBasic | null>(null)
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!districtCode || !industryCode) {
      router.push('/business-analysis')
      return
    }

    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // 병렬로 모든 데이터 로드
        const [predictionData, characteristicsData, detailData, districts, industries] =
          await Promise.all([
            predictBusinessSuccess({
              district_code: districtCode,
              industry_code: industryCode,
            }),
            getDistrictCharacteristics(districtCode),
            getDistrictDetail(districtCode),
            getDistricts(),
            getIndustries(),
          ])

        setPrediction(predictionData)
        setCharacteristics(characteristicsData)
        setDistrictDetail(detailData)
        setDistrict(districts.find((d) => d.code === districtCode) || null)
        setIndustry(industries.find((i) => i.code === industryCode) || null)
      } catch (err) {
        console.error('데이터 로드 실패:', err)
        if (err instanceof APIError) {
          setError(err.message)
        } else {
          setError('분석 결과를 불러오는데 실패했습니다. 다시 시도해주세요.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [districtCode, industryCode])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">분석 중입니다...</p>
        </div>
      </div>
    )
  }

  if (error || !prediction || !characteristics || !districtDetail || !district || !industry) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">오류가 발생했습니다</h2>
          <p className="text-gray-600 mb-6">{error || '데이터를 불러올 수 없습니다.'}</p>
          <button
            onClick={() => router.push('/business-analysis')}
            className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            다시 시도하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/business-analysis')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>다시 검색하기</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">상권 분석 결과</h1>
              <p className="text-gray-600">
                {district.name} × {industry.name}
              </p>
            </div>

            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Share2 className="w-4 h-4" />
                <span>공유하기</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Download className="w-4 h-4" />
                <span>PDF 저장</span>
              </button>
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="space-y-8">
          {/* 첫 번째 행: 성공 확률 + 상세 지표 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <SuccessProbabilityCard
              result={prediction}
              districtName={district.name}
              industryName={industry.name}
            />
            <MetricsCard statistics={districtDetail.statistics} characteristics={characteristics} />
          </div>

          {/* 두 번째 행: 상권 특성 (전체 너비) */}
          <div>
            <DistrictCharacteristicsCard characteristics={characteristics} />
          </div>
        </div>

        {/* 하단 CTA */}
        <div className="mt-8 p-6 bg-white rounded-xl shadow-sm text-center">
          <h3 className="font-semibold text-gray-900 mb-2">더 자세한 분석이 필요하신가요?</h3>
          <p className="text-gray-600 mb-4">
            여러 지역을 비교하거나 업종별 통계를 확인해보세요.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/business-analysis/compare')}
              className="px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              지역 비교하기
            </button>
            <button
              onClick={() =>
                router.push(`/business-analysis/industry/${industryCode}`)
              }
              className="px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              업종 통계 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
