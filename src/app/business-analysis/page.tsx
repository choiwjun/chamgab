'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search, Store, TrendingUp } from 'lucide-react'
import { RegionSelect } from '@/components/business/RegionSelect'
import { IndustrySelect } from '@/components/business/IndustrySelect'

export default function BusinessAnalysisPage() {
  const router = useRouter()
  const [districtCode, setDistrictCode] = useState('')
  const [industryCode, setIndustryCode] = useState('')

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!districtCode || !industryCode) return
    router.push(`/business-analysis/result?district=${districtCode}&industry=${industryCode}`)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600">
            <TrendingUp className="h-4 w-4" />
            AI 기반 상권 분석
          </div>
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            창업 성공 확률을
            <br />
            미리 확인하세요
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            지역과 업종 데이터를 바탕으로 창업 성공 가능성을 분석합니다.
          </p>
        </div>

        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                <MapPin className="mr-1 inline h-4 w-4" />
                분석할 지역 선택
              </label>
              <RegionSelect
                value={districtCode}
                onChange={setDistrictCode}
                placeholder="예: 강남구, 분당구, 해운대구"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                <Store className="mr-1 inline h-4 w-4" />
                업종 선택
              </label>
              <IndustrySelect
                value={industryCode}
                onChange={setIndustryCode}
                placeholder="예: 커피 전문점"
              />
            </div>

            <button
              type="submit"
              disabled={!districtCode || !industryCode}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Search className="h-5 w-5" />
              분석 시작하기
            </button>
            <p className="text-center text-xs text-gray-500">
              입력 화면은 누구나 이용 가능하며, 상세 결과는 로그인 후 계속 이용할 수 있습니다.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
