'use client'
const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8002'

import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface TimeSlotScore {
  time: string
  traffic: number
  score: number
}

interface PeakHoursData {
  peak_hours: Record<string, TimeSlotScore>
  best_time: string
  recommendation: string
}

interface PeakHoursAnalysisProps {
  districtCode: string
}

export default function PeakHoursAnalysis({
  districtCode,
}: PeakHoursAnalysisProps) {
  const { data, isLoading, error } = useQuery<PeakHoursData>({
    queryKey: ['peak-hours', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/commercial/districts/${districtCode}/peak-hours`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch peak hours data')
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

  // 차트 데이터 변환
  const chartData = Object.entries(data.peak_hours).map(([_key, value]) => ({
    name: value.time,
    유동인구: value.traffic,
    점수: value.score,
  }))

  // 최고 시간대 정보
  const bestTimeData = data.peak_hours[data.best_time]

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">시간대별 유동인구 분석</h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
          <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="유동인구" fill="#8884d8" />
          <Bar yAxisId="right" dataKey="점수" fill="#82ca9d" />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 최고 시간대 */}
        <div className="rounded-lg bg-blue-50 p-4">
          <h4 className="mb-2 font-semibold text-blue-900">🏆 최고 시간대</h4>
          <p className="text-2xl font-bold text-blue-900">
            {bestTimeData.time}
          </p>
          <p className="mt-1 text-sm text-blue-700">
            유동인구: {bestTimeData.traffic.toLocaleString()}명
          </p>
          <p className="text-sm text-blue-700">점수: {bestTimeData.score}/10</p>
        </div>

        {/* 추천 */}
        <div className="rounded-lg bg-green-50 p-4">
          <h4 className="mb-2 font-semibold text-green-900">💡 추천</h4>
          <p className="text-sm text-green-800">{data.recommendation}</p>
        </div>
      </div>

      {/* 시간대별 상세 */}
      <div className="mt-6">
        <h4 className="mb-3 font-semibold">시간대별 상세 정보</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Object.entries(data.peak_hours).map(([key, value]) => (
            <div
              key={key}
              className={`rounded-lg border p-3 ${
                key === data.best_time
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              <p className="text-xs text-gray-600">{value.time}</p>
              <p className="text-lg font-semibold">
                {value.traffic.toLocaleString()}
              </p>
              <div className="mt-1 flex items-center">
                <div className="h-2 flex-1 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${value.score * 10}%` }}
                  ></div>
                </div>
                <span className="ml-2 text-xs text-gray-600">
                  {value.score}/10
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
