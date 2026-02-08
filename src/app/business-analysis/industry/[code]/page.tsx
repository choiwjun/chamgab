'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { IndustryOverview } from '@/components/business/IndustryOverview'
import { getIndustryStatistics, APIError } from '@/lib/api/commercial'
import type { IndustryStatistics } from '@/types/commercial'

export default function IndustryPage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const [statistics, setStatistics] = useState<IndustryStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      router.push('/business-analysis')
      return
    }

    const loadStatistics = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const data = await getIndustryStatistics(code)
        setStatistics(data)
      } catch (err) {
        console.error('업종 통계 로드 실패:', err)
        if (err instanceof APIError) {
          setError(err.message)
        } else {
          setError('업종 통계를 불러오는데 실패했습니다.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadStatistics()
  }, [code, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600">업종 통계를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !statistics) {
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
            돌아가기
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
            <span>돌아가기</span>
          </button>
        </div>

        {/* 메인 콘텐츠 */}
        <IndustryOverview statistics={statistics} />

        {/* 하단 CTA */}
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center">
          <h3 className="mb-2 font-semibold text-gray-900">
            이 업종으로 창업을 고려 중이신가요?
          </h3>
          <p className="mb-4 text-gray-600">
            원하는 상권을 선택해서 상세한 분석 결과를 확인해보세요.
          </p>
          <button
            onClick={() => router.push('/business-analysis')}
            className="rounded-lg bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
          >
            상권 분석 시작하기
          </button>
        </div>
      </div>
    </div>
  )
}
