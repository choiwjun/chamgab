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
      router.push(`/business-analysis/result?district=${districtCode}&industry=${industryCode}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <TrendingUp className="w-4 h-4" />
            AI 기반 상권 분석
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            창업 성공 확률을
            <br />
            미리 확인하세요
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            AI가 분석한 상권 데이터로 창업 성공 가능성을 예측하고,
            <br />
            데이터 기반의 현명한 의사결정을 내리세요.
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                분석할 상권 선택
              </label>
              <RegionSelect
                value={districtCode}
                onChange={setDistrictCode}
                placeholder="예: 강남역 상권"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Store className="w-4 h-4 inline mr-1" />
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
              className="w-full bg-primary-500 text-white py-4 rounded-lg font-semibold text-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-5 h-5" />
              분석 시작하기
            </button>
          </form>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">성공 확률 예측</h3>
            <p className="text-sm text-gray-600">
              AI가 과거 데이터를 분석하여 창업 성공 확률을 정확하게 예측합니다.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <MapPin className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">상권 특성 분석</h3>
            <p className="text-sm text-gray-600">
              유동인구, 연령대, 소비패턴 등 상권의 핵심 특성을 상세히 분석합니다.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Store className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">경쟁 현황 파악</h3>
            <p className="text-sm text-gray-600">
              업종별 경쟁 강도와 시장 포화도를 분석하여 진입 타이밍을 제안합니다.
            </p>
          </div>
        </div>

        {/* Recent Searches */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>최근 분석: 강남역 × 커피전문점 · 홍대입구 × 치킨전문점 · 잠실역 × 편의점</p>
        </div>
      </div>
    </div>
  )
}
