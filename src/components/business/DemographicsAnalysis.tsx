'use client'
const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface AgeGroupScore {
  count: number
  percentage: number
  score: number
}

interface PersonaInfo {
  name: string
  age: string
  lifestyle: string
}

interface IndustryMatch {
  code: string
  name: string
  match_score: number
}

interface DemographicsData {
  demographics: Record<string, AgeGroupScore>
  primary_target: string
  persona: PersonaInfo
  suggested_industries: IndustryMatch[]
}

interface DemographicsAnalysisProps {
  districtCode: string
}

const COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
]

const AGE_GROUP_LABELS: Record<string, string> = {
  '10s': '10대',
  '20s': '20대',
  '30s': '30대',
  '40s': '40대',
  '50s': '50대',
  '60s': '60대 이상',
}

export default function DemographicsAnalysis({
  districtCode,
}: DemographicsAnalysisProps) {
  const { data, isLoading, error } = useQuery<DemographicsData>({
    queryKey: ['demographics', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/commercial/districts/${districtCode}/demographics`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch demographics data')
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

  // 차트 데이터 변환 (0인 항목 제외)
  const chartData = Object.entries(data.demographics)
    .filter(([_, info]) => info.percentage > 0)
    .map(([age, info]) => ({
      name: AGE_GROUP_LABELS[age] || age,
      value: info.percentage,
      count: info.count,
    }))

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">연령대별 고객 분석</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 차트 */}
        <div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 타겟 고객 및 추천 */}
        <div className="space-y-4">
          {/* 타겟 고객 페르소나 */}
          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="mb-2 font-bold text-blue-900">🎯 타겟 고객</h4>
            <p className="text-lg font-semibold text-blue-900">
              {data.persona.name}
            </p>
            <p className="text-sm text-blue-700">{data.persona.age}</p>
            <p className="mt-1 text-xs text-blue-600">
              {data.persona.lifestyle}
            </p>
          </div>

          {/* 추천 업종 */}
          <div className="rounded-lg bg-green-50 p-4">
            <h4 className="mb-3 font-bold text-green-900">💡 추천 업종</h4>
            <div className="space-y-2">
              {data.suggested_industries.map((industry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded bg-white p-2"
                >
                  <span className="text-sm font-medium">{industry.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 flex-1 rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-green-500"
                        style={{ width: `${industry.match_score}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold text-green-600">
                      {industry.match_score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 연령대별 상세 정보 */}
      <div className="mt-6">
        <h4 className="mb-3 font-semibold">연령대별 상세 정보</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Object.entries(data.demographics).map(([age, info]) => (
            <div
              key={age}
              className={`rounded-lg border p-3 ${
                age === data.primary_target
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              <p className="text-xs text-gray-600">
                {AGE_GROUP_LABELS[age] || age}
              </p>
              <p className="text-lg font-semibold">{info.percentage}%</p>
              <p className="text-xs text-gray-500">
                {info.count.toLocaleString()}명
              </p>
              {age === data.primary_target && (
                <span className="mt-1 inline-block rounded bg-blue-500 px-2 py-0.5 text-xs text-white">
                  주 타겟
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
