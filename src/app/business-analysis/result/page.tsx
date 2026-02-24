'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Download, Share2 } from 'lucide-react'
import {
  APIError,
  getDistrictCharacteristics,
  getDistrictDetail,
  getDistricts,
  getIndustries,
  predictBusinessSuccess,
} from '@/lib/api/commercial'
import type {
  BusinessPredictionResult,
  DistrictBasic,
  DistrictCharacteristics,
  DistrictDetail,
  Industry,
} from '@/types/commercial'

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
  () => import('@/components/business/MetricsCard').then((mod) => mod.MetricsCard),
  { loading: () => <div className="h-32 animate-pulse rounded bg-gray-100" /> }
)

const PeakHoursAnalysis = dynamic(() => import('@/components/business/PeakHoursAnalysis'), {
  loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" />,
})
const DemographicsAnalysis = dynamic(() => import('@/components/business/DemographicsAnalysis'), {
  loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" />,
})
const WeekendAnalysis = dynamic(() => import('@/components/business/WeekendAnalysis'), {
  loading: () => <div className="h-80 animate-pulse rounded bg-gray-100" />,
})
const ProfileAnalysis = dynamic(() => import('@/components/business/ProfileAnalysis'), {
  loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" />,
})
const CompetitionAnalysis = dynamic(() => import('@/components/business/CompetitionAnalysis'), {
  loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" />,
})
const GrowthPotential = dynamic(() => import('@/components/business/GrowthPotential'), {
  loading: () => <div className="h-96 animate-pulse rounded bg-gray-100" />,
})
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
  const reportRef = useRef<HTMLDivElement | null>(null)

  const [prediction, setPrediction] = useState<BusinessPredictionResult | null>(null)
  const [characteristics, setCharacteristics] = useState<DistrictCharacteristics | null>(null)
  const [districtDetail, setDistrictDetail] = useState<DistrictDetail | null>(null)
  const [district, setDistrict] = useState<DistrictBasic | null>(null)
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [isSavingPdf, setIsSavingPdf] = useState(false)

  useEffect(() => {
    if (!districtCode || !industryCode) {
      router.push('/business-analysis')
      return
    }

    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const [predictionRes, characteristicsRes, detailRes, districtsRes, industriesRes] =
          await Promise.allSettled([
            predictBusinessSuccess({
              district_code: districtCode,
              industry_code: industryCode,
            }),
            getDistrictCharacteristics(districtCode),
            getDistrictDetail(districtCode, industryCode),
            getDistricts(),
            getIndustries(),
          ])

        if (predictionRes.status === 'fulfilled') setPrediction(predictionRes.value)
        else throw predictionRes.reason

        if (characteristicsRes.status === 'fulfilled') setCharacteristics(characteristicsRes.value)
        if (detailRes.status === 'fulfilled') setDistrictDetail(detailRes.value)
        if (districtsRes.status === 'fulfilled') {
          setDistrict(districtsRes.value.find((item) => item.code === districtCode) || null)
        }
        if (industriesRes.status === 'fulfilled') {
          setIndustry(industriesRes.value.find((item) => item.code === industryCode) || null)
        }
      } catch (loadError) {
        if (loadError instanceof APIError) setError(loadError.message)
        else setError('분석 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [districtCode, industryCode, router])

  const districtName = district?.name || districtCode || '선택한 지역'
  const industryName = industry?.name || industryCode || '선택한 업종'
  const shareTitle = `${districtName} / ${industryName} 상권 분석 결과`

  const handleShare = async () => {
    if (isSharing) return
    setIsSharing(true)
    try {
      const shareUrl = window.location.href
      const text = `${districtName} / ${industryName} 상권 분석 결과를 확인해 보세요.`
      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text, url: shareUrl })
          return
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === 'AbortError') return
        }
      }
      await navigator.clipboard.writeText(shareUrl)
      window.alert('링크를 복사했습니다.')
    } finally {
      setIsSharing(false)
    }
  }

  const handleSavePdf = () => {
    if (isSavingPdf) return
    const reportElement = reportRef.current
    if (!reportElement) return
    setIsSavingPdf(true)

    try {
      const popup = window.open('', '_blank', 'noopener,noreferrer,width=1280,height=900')
      if (!popup) {
        window.print()
        return
      }

      const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((node) => node.outerHTML)
        .join('\n')

      popup.document.write(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${shareTitle}</title>
    ${styles}
    <style>
      body { margin: 0; padding: 24px; background: #fff; }
      [data-print-hide="true"] { display: none !important; }
      @page { size: A4; margin: 12mm; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  </head>
  <body>${reportElement.innerHTML}</body>
</html>`)
      popup.document.close()
      popup.focus()
      setTimeout(() => {
        popup.print()
        popup.close()
      }, 500)
    } finally {
      setIsSavingPdf(false)
    }
  }

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

  if (error || !prediction) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md px-4 text-center">
          <h2 className="mb-2 text-xl font-bold text-gray-900">오류가 발생했습니다</h2>
          <p className="mb-6 text-gray-600">{error || '결과를 불러오지 못했습니다.'}</p>
          <button
            onClick={() => router.push('/business-analysis')}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
          >
            다시 검색하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div ref={reportRef} className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.push('/business-analysis')}
            data-print-hide="true"
            className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>다시 검색하기</span>
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold text-gray-900">상권 분석 결과</h1>
              <p className="text-gray-600">
                {districtName} × {industryName}
              </p>
            </div>

            <div className="flex gap-3" data-print-hide="true">
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Share2 className="h-4 w-4" />
                <span>공유하기</span>
              </button>
              <button
                onClick={handleSavePdf}
                disabled={isSavingPdf}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                <span>PDF 저장</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <SuccessProbabilityCard
              result={prediction}
              districtName={districtName}
              industryName={industryName}
            />
            {districtDetail && (
              <MetricsCard
                statistics={districtDetail.statistics}
                characteristics={characteristics ?? undefined}
              />
            )}
          </div>

          {characteristics && <DistrictCharacteristicsCard characteristics={characteristics} />}

          {districtCode && (
            <>
              <PeakHoursAnalysis districtCode={districtCode} />
              <DemographicsAnalysis districtCode={districtCode} />
              <WeekendAnalysis districtCode={districtCode} />
              <ProfileAnalysis districtCode={districtCode} />
              <CompetitionAnalysis districtCode={districtCode} />
              <GrowthPotential districtCode={districtCode} />
              <IndustryRecommendation districtCode={districtCode} />
            </>
          )}
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
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <BusinessAnalysisResultContent />
    </Suspense>
  )
}
