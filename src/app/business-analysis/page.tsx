'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, TrendingUp, Store, MapPin } from 'lucide-react'
import { RegionSelect } from '@/components/business/RegionSelect'
import { IndustrySelect } from '@/components/business/IndustrySelect'

export default function BusinessAnalysisPage() {
  const router = useRouter()
  const [districtCode, setDistrictCode] = useState('')
  const [industryCode, setIndustryCode] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (districtCode && industryCode) {
      router.push(
        `/business-analysis/result?district=${districtCode}&industry=${industryCode}`
      )
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Hero Section */}
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
            AI가 분석한 상권 데이터로 창업 성공 가능성을 예측하고,
            <br />
            데이터 기반의 현명한 의사결정을 내리세요.
          </p>
        </div>

        {/* Search Form */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                <MapPin className="mr-1 inline h-4 w-4" />
                분석할 상권 선택
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
                창업 희망 업종 선택
              </label>
              <IndustrySelect
                value={industryCode}
                onChange={setIndustryCode}
                placeholder="예: 커피전문점"
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
          </form>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="mb-2 font-semibold text-gray-900">성공 확률 예측</h3>
            <p className="text-sm text-gray-600">
              AI가 과거 데이터를 분석하여 창업 성공 확률을 정확하게 예측합니다.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <MapPin className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="mb-2 font-semibold text-gray-900">상권 특성 분석</h3>
            <p className="text-sm text-gray-600">
              유동인구, 연령대, 소비패턴 등 상권의 핵심 특성을 상세히
              분석합니다.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
              <Store className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="mb-2 font-semibold text-gray-900">경쟁 현황 파악</h3>
            <p className="text-sm text-gray-600">
              업종별 경쟁 강도와 시장 포화도를 분석하여 진입 타이밍을
              제안합니다.
            </p>
          </div>
        </div>

        {/* Recent Searches */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            최근 분석: 강남역 × 커피전문점 · 홍대입구 × 치킨전문점 · 잠실역 ×
            편의점
          </p>
        </div>
      </div>
    </div>
  )
}
