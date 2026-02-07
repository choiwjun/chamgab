'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { ComparisonTable } from '@/components/business/ComparisonTable'
import { RegionSelect } from '@/components/business/RegionSelect'
import { IndustrySelect } from '@/components/business/IndustrySelect'
import { compareRegions, getIndustries, APIError } from '@/lib/api/commercial'
import type { RegionComparisonResult, Industry } from '@/types/commercial'

function CompareRegionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([])
  const [industryCode, setIndustryCode] = useState('')
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [comparisonResult, setComparisonResult] =
    useState<RegionComparisonResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // URL 파라미터에서 초기값 설정
  useEffect(() => {
    const districtsParam = searchParams.get('districts')
    const industryParam = searchParams.get('industry')

    if (districtsParam) {
      setSelectedDistricts(districtsParam.split(',').slice(0, 3))
    }
    if (industryParam) {
      setIndustryCode(industryParam)
      loadIndustry(industryParam)
    }
  }, [searchParams])

  // 업종 정보 로드
  const loadIndustry = async (code: string) => {
    try {
      const industries = await getIndustries()
      const found = industries.find((i) => i.code === code)
      setIndustry(found || null)
    } catch (err) {
      console.error('업종 로드 실패:', err)
      if (err instanceof APIError) {
        setError(err.message)
      } else {
        setError('업종 정보를 불러오는데 실패했습니다.')
      }
    }
  }

  // 지역 추가
  const addDistrict = (code: string) => {
    if (selectedDistricts.length >= 3) {
      alert('최대 3개 지역까지 비교할 수 있습니다.')
      return
    }
    if (!selectedDistricts.includes(code)) {
      setSelectedDistricts([...selectedDistricts, code])
    }
  }

  // 지역 제거
  const removeDistrict = (code: string) => {
    setSelectedDistricts(selectedDistricts.filter((d) => d !== code))
  }

  // 비교 실행
  const handleCompare = async () => {
    if (selectedDistricts.length < 2) {
      alert('최소 2개 지역을 선택해주세요.')
      return
    }
    if (!industryCode) {
      alert('업종을 선택해주세요.')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const result = await compareRegions(selectedDistricts, industryCode)
      setComparisonResult(result)
    } catch (err) {
      console.error('비교 실패:', err)
      if (err instanceof APIError) {
        setError(err.message)
      } else {
        setError('비교 결과를 불러오는데 실패했습니다.')
      }
    } finally {
      setIsLoading(false)
    }
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

          <h1 className="mb-2 text-3xl font-bold text-gray-900">지역 비교</h1>
          <p className="text-gray-600">
            최대 3개 지역의 창업 성공 확률을 비교합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* 왼쪽: 선택 패널 */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-xl font-bold text-gray-900">
                비교 설정
              </h2>

              {/* 업종 선택 */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  업종 선택
                </label>
                <IndustrySelect
                  value={industryCode}
                  onChange={setIndustryCode}
                />
              </div>

              {/* 지역 추가 */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  지역 추가 ({selectedDistricts.length}/3)
                </label>
                <RegionSelect
                  value=""
                  onChange={addDistrict}
                  placeholder="지역 추가..."
                />
              </div>

              {/* 선택된 지역 목록 */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  선택된 지역
                </label>
                {selectedDistricts.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">
                    비교할 지역을 선택해주세요
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDistricts.map((code, index) => (
                      <div
                        key={code}
                        className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-500">
                            #{index + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {code}
                          </span>
                        </div>
                        <button
                          onClick={() => removeDistrict(code)}
                          className="p-1 text-gray-400 transition-colors hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 비교 버튼 */}
              <button
                onClick={handleCompare}
                disabled={
                  selectedDistricts.length < 2 || !industryCode || isLoading
                }
                className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isLoading ? '분석 중...' : '비교하기'}
              </button>
            </div>
          </div>

          {/* 오른쪽: 결과 */}
          <div className="lg:col-span-2">
            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            {!comparisonResult && !error && (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <Plus className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-gray-900">
                  비교를 시작하세요
                </h3>
                <p className="text-gray-600">
                  왼쪽에서 업종과 지역을 선택한 후 비교 버튼을 클릭하세요.
                </p>
              </div>
            )}

            {comparisonResult && industry && (
              <ComparisonTable
                comparisons={comparisonResult.comparisons}
                industryName={industry.name}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CompareRegionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      }
    >
      <CompareRegionsContent />
    </Suspense>
  )
}
