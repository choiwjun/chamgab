'use client'
const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

import { useQuery } from '@tanstack/react-query'
import { Store, Users, TrendingUp, CheckCircle2 } from 'lucide-react'

interface ProfileData {
  district_type: string
  description: string
  primary_customer: string
  lifestyle: string
  success_factors: string[]
  best_industries: string[]
}

interface ProfileAnalysisProps {
  districtCode: string
}

export default function ProfileAnalysis({
  districtCode,
}: ProfileAnalysisProps) {
  const { data, isLoading, error } = useQuery<ProfileData>({
    queryKey: ['profile', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/commercial/districts/${districtCode}/profile`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch profile data')
      }
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/3 rounded bg-gray-200"></div>
          <div className="h-64 rounded bg-gray-200"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-red-600">데이터를 불러오는데 실패했습니다.</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">상권 프로필 분석</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 상권 특성 */}
        <div className="space-y-4">
          {/* 상권 유형 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Store className="h-5 w-5 text-blue-600" />
              <h4 className="font-bold text-blue-900">상권 유형</h4>
            </div>
            <p className="text-2xl font-bold text-blue-900">
              {data.district_type}
            </p>
            <p className="mt-2 text-sm text-blue-700">{data.description}</p>
          </div>

          {/* 주 고객 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <h4 className="font-bold text-blue-900">주 고객층</h4>
            </div>
            <p className="text-lg font-semibold text-blue-900">
              {data.primary_customer}
            </p>
            <p className="mt-2 text-sm text-blue-700">{data.lifestyle}</p>
          </div>
        </div>

        {/* 성공 요인 & 추천 업종 */}
        <div className="space-y-4">
          {/* 성공 요인 */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h4 className="font-bold text-green-900">성공 요인</h4>
            </div>
            <ul className="space-y-2">
              {data.success_factors.map((factor, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-600"></span>
                  <span className="text-green-800">{factor}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 추천 업종 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h4 className="font-bold text-blue-900">추천 업종</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {data.best_industries.map((industry, i) => (
                <div
                  key={i}
                  className="rounded bg-white px-3 py-2 text-center text-sm font-medium text-blue-900"
                >
                  {industry}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 종합 인사이트 */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h4 className="mb-2 font-bold text-gray-900">💡 종합 인사이트</h4>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">{data.district_type}</span>은(는){' '}
          {data.description}. 주요 고객층은{' '}
          <span className="font-semibold">{data.primary_customer}</span>
          이며, {data.lifestyle} 특징을 보입니다. 이 상권에서 성공하기 위해서는{' '}
          {data.success_factors[0]}이(가) 특히 중요합니다.
        </p>
      </div>
    </div>
  )
}
