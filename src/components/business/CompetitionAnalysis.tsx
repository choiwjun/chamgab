'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, MapPin, TrendingDown } from 'lucide-react'

interface AlternativeDistrict {
  code: string
  name: string
  distance: number
  store_count: number
  success_rate: number
  reason: string
}

interface CompetitionData {
  competition_level: string
  total_stores: number
  franchise_ratio: number
  density_score: number
  alternatives: AlternativeDistrict[]
  recommendation: string
}

interface CompetitionAnalysisProps {
  districtCode: string
}

export default function CompetitionAnalysis({
  districtCode,
}: CompetitionAnalysisProps) {
  const { data, isLoading, error } = useQuery<CompetitionData>({
    queryKey: ['competition', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `http://localhost:8002/api/commercial/districts/${districtCode}/competition`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch competition data')
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

  const levelColor =
    {
      높음: 'red',
      중간: 'yellow',
      낮음: 'green',
    }[data.competition_level] || 'gray'

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">경쟁 밀집도 분석</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 경쟁 수준 */}
        <div
          className={`rounded-lg border p-4 ${
            levelColor === 'red'
              ? 'border-red-200 bg-red-50'
              : levelColor === 'yellow'
                ? 'border-yellow-200 bg-yellow-50'
                : 'border-green-200 bg-green-50'
          }`}
        >
          <h4
            className={`mb-2 font-bold ${
              levelColor === 'red'
                ? 'text-red-900'
                : levelColor === 'yellow'
                  ? 'text-yellow-900'
                  : 'text-green-900'
            }`}
          >
            경쟁 수준
          </h4>
          <p
            className={`text-3xl font-bold ${
              levelColor === 'red'
                ? 'text-red-900'
                : levelColor === 'yellow'
                  ? 'text-yellow-900'
                  : 'text-green-900'
            }`}
          >
            {data.competition_level}
          </p>
          <div className="mt-3 h-2 rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full ${
                levelColor === 'red'
                  ? 'bg-red-500'
                  : levelColor === 'yellow'
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${data.density_score * 10}%` }}
            ></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            밀집도: {data.density_score}/10
          </p>
        </div>

        {/* 점포 현황 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-2 font-bold text-gray-900">점포 현황</h4>
          <p className="text-3xl font-bold text-gray-900">
            {data.total_stores}
          </p>
          <p className="text-sm text-gray-600">총 점포 수</p>
          <div className="mt-3 text-sm text-gray-700">
            프랜차이즈:{' '}
            <span className="font-semibold">{data.franchise_ratio}%</span>
          </div>
        </div>

        {/* 추천 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-blue-600" />
            <h4 className="font-bold text-blue-900">분석 결과</h4>
          </div>
          <p className="text-sm text-blue-800">{data.recommendation}</p>
        </div>
      </div>

      {/* 대안 상권 */}
      {data.alternatives && data.alternatives.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3 font-semibold">💡 대안 상권 추천</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.alternatives.map((alt, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h5 className="font-semibold text-gray-900">{alt.name}</h5>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                      <MapPin className="h-3 w-3" />
                      <span>{alt.distance}km</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">
                      {alt.success_rate}%
                    </p>
                    <p className="text-xs text-gray-500">성공률</p>
                  </div>
                </div>
                <div className="mt-2 rounded bg-white p-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">점포 수</span>
                    <span className="font-semibold text-gray-900">
                      {alt.store_count}개
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-blue-700">
                  <TrendingDown className="mr-1 inline h-3 w-3" />
                  {alt.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
