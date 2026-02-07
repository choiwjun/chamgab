'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Share2, Download } from 'lucide-react'
import dynamic from 'next/dynamic'
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

// 코드 스플리팅: 큰 컴포넌트들을 lazy load
const SuccessProbabilityCard = dynamic(
  () =>
    import('@/components/business/SuccessProbabilityCard').then(
      (mod) => mod.SuccessProbabilityCard
    ),
  { loading: () => <div className="h-64 animate-pulse rounded bg-gray-100" /> }
)

const DistrictCharacteristicsCard = dynamic(
  () =>
    import('@/components/business/DistrictCharacteristicsCard').then(
      (mod) => mod.DistrictCharacteristicsCard
    ),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

const MetricsCard = dynamic(
  () =>
    import('@/components/business/MetricsCard').then((mod) => mod.MetricsCard),
  { loading: () => <div className="h-32 animate-pulse rounded bg-gray-100" /> }
)

const PeakHoursAnalysis = dynamic(
  () => import('@/components/business/PeakHoursAnalysis'),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

const DemographicsAnalysis = dynamic(
  () => import('@/components/business/DemographicsAnalysis'),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

const WeekendAnalysis = dynamic(
  () => import('@/components/business/WeekendAnalysis'),
  { loading: () => <div className="h-80 animate-pulse rounded bg-gray-100" /> }
)

const ProfileAnalysis = dynamic(
  () => import('@/components/business/ProfileAnalysis'),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

const CompetitionAnalysis = dynamic(
  () => import('@/components/business/CompetitionAnalysis'),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

const GrowthPotential = dynamic(
  () => import('@/components/business/GrowthPotential'),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

const IndustryRecommendation = dynamic(
  () =>
    import('@/components/business/IndustryRecommendation').then(
      (mod) => mod.IndustryRecommendation
    ),
  { loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" /> }
)

function BusinessAnalysisResultContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const districtCode = searchParams.get('district')
  const industryCode = searchParams.get('industry')

  const [prediction, setPrediction] = useState<BusinessPredictionResult | null>(
    null
  )
  const [characteristics, setCharacteristics] =
    useState<DistrictCharacteristics | null>(null)
  const [districtDetail, setDistrictDetail] = useState<DistrictDetail | null>(
    null
  )
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
        const [
          predictionData,
          characteristicsData,
          detailData,
          districts,
          industries,
        ] = await Promise.all([
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
  }, [districtCode, industryCode, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600">분석 중입니다...</p>
        </div>
      </div>
    )
  }

  if (
    error ||
    !prediction ||
    !characteristics ||
    !districtDetail ||
    !district ||
    !industry
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md px-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <span className="text-2xl text-red-600">!</span>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">
            오류가 발생했습니다
          </h2>
          <p className="mb-6 text-gray-600">
            {error || '데이터를 불러올 수 없습니다.'}
          </p>
          <button
            onClick={() => router.push('/business-analysis')}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
          >
            다시 시도하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/business-analysis')}
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>다시 검색하기</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold text-gray-900">
                상권 분석 결과
              </h1>
              <p className="text-gray-600">
                {district.name} × {industry.name}
              </p>
            </div>

            <div className="flex gap-3">
              <button className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50">
                <Share2 className="h-4 w-4" />
                <span>공유하기</span>
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50">
                <Download className="h-4 w-4" />
                <span>PDF 저장</span>
              </button>
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="space-y-8">
          {/* 첫 번째 행: 성공 확률 + 상세 지표 */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <SuccessProbabilityCard
              result={prediction}
              districtName={district.name}
              industryName={industry.name}
            />
            <MetricsCard
              statistics={districtDetail.statistics}
              characteristics={characteristics}
            />
          </div>

          {/* 두 번째 행: 상권 특성 (전체 너비) */}
          <div>
            <DistrictCharacteristicsCard characteristics={characteristics} />
          </div>

          {/* Phase 6: 상권 분석 고도화 */}
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">상세 분석</h2>

            {/* 시간대별 분석 */}
            <PeakHoursAnalysis districtCode={districtCode!} />

            {/* 연령대별 분석 */}
            <DemographicsAnalysis districtCode={districtCode!} />

            {/* 주말/평일 비교 */}
            <WeekendAnalysis districtCode={districtCode!} />

            {/* 상권 프로필 */}
            <ProfileAnalysis districtCode={districtCode!} />

            {/* 경쟁 분석 */}
            <CompetitionAnalysis districtCode={districtCode!} />

            {/* 성장 가능성 */}
            <GrowthPotential districtCode={districtCode!} />

            {/* AI 업종 추천 */}
            <IndustryRecommendation districtCode={districtCode!} />
          </div>
        </div>

        {/* 하단 CTA */}
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center">
          <h3 className="mb-2 font-semibold text-gray-900">
            더 자세한 분석이 필요하신가요?
          </h3>
          <p className="mb-4 text-gray-600">
            여러 지역을 비교하거나 업종별 통계를 확인해보세요.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => router.push('/business-analysis/compare')}
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 hover:bg-gray-50"
            >
              지역 비교하기
            </button>
            <button
              onClick={() =>
                router.push(`/business-analysis/industry/${industryCode}`)
              }
              className="rounded-lg bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
            >
              업종 통계 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BusinessAnalysisResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="text-gray-600">분석 중입니다...</p>
          </div>
        </div>
      }
    >
      <BusinessAnalysisResultContent />
    </Suspense>
  )
}
