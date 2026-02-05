'use client'
const API_URL = process.env.NEXT_PUBLIC_ML_API_URL || '${API_URL}'

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

interface WeekendAnalysisData {
  weekday_avg: number
  weekend_avg: number
  weekend_ratio: number
  advantage: 'weekend' | 'weekday'
  difference_percent: number
  recommendation: string
}

interface WeekendAnalysisProps {
  districtCode: string
}

export default function WeekendAnalysis({
  districtCode,
}: WeekendAnalysisProps) {
  const { data, isLoading, error } = useQuery<WeekendAnalysisData>({
    queryKey: ['weekend-analysis', districtCode],
    queryFn: async () => {
      const response = await fetch(
        `${API_URL}/api/commercial/districts/${districtCode}/weekend-analysis`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch weekend analysis data')
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

  // 차트 데이터
  const chartData = [
    {
      name: '평일',
      유동인구: data.weekday_avg,
    },
    {
      name: '주말',
      유동인구: data.weekend_avg,
    },
  ]

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-bold">주말/평일 비교 분석</h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => value.toLocaleString() + '명'}
          />
          <Legend />
          <Bar dataKey="유동인구" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 평일 */}
        <div
          className={`rounded-lg border p-4 ${
            data.advantage === 'weekday'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200'
          }`}
        >
          <h4 className="mb-2 font-semibold text-gray-700">평일</h4>
          <p className="text-2xl font-bold text-gray-900">
            {data.weekday_avg.toLocaleString()}
          </p>
          <p className="text-sm text-gray-600">평균 유동인구</p>
          {data.advantage === 'weekday' && (
            <span className="mt-2 inline-block rounded bg-blue-500 px-2 py-1 text-xs text-white">
              우위
            </span>
          )}
        </div>

        {/* 주말 */}
        <div
          className={`rounded-lg border p-4 ${
            data.advantage === 'weekend'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200'
          }`}
        >
          <h4 className="mb-2 font-semibold text-gray-700">주말</h4>
          <p className="text-2xl font-bold text-gray-900">
            {data.weekend_avg.toLocaleString()}
          </p>
          <p className="text-sm text-gray-600">
            평균 유동인구 ({data.weekend_ratio}%)
          </p>
          {data.advantage === 'weekend' && (
            <span className="mt-2 inline-block rounded bg-orange-500 px-2 py-1 text-xs text-white">
              우위
            </span>
          )}
        </div>

        {/* 차이 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-2 font-semibold text-gray-700">차이</h4>
          <p className="text-2xl font-bold text-gray-900">
            {data.difference_percent}%
          </p>
          <p className="text-sm text-gray-600">
            {data.advantage === 'weekday' ? '평일' : '주말'}이 더 많음
          </p>
        </div>
      </div>

      {/* 추천 */}
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
        <h4 className="mb-2 font-semibold text-green-900">💡 추천</h4>
        <p className="text-sm text-green-800">{data.recommendation}</p>
      </div>

      {/* 상세 분석 */}
      <div className="mt-6">
        <h4 className="mb-3 font-semibold">분석 요약</h4>
        <div className="space-y-2 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            • 평일 평균:{' '}
            <span className="font-semibold">
              {data.weekday_avg.toLocaleString()}명
            </span>
          </p>
          <p className="text-sm text-gray-700">
            • 주말 평균:{' '}
            <span className="font-semibold">
              {data.weekend_avg.toLocaleString()}명
            </span>
          </p>
          <p className="text-sm text-gray-700">
            • 주말 비율:{' '}
            <span className="font-semibold">{data.weekend_ratio}%</span>
          </p>
          <p className="text-sm text-gray-700">
            • {data.advantage === 'weekday' ? '평일' : '주말'}이{' '}
            <span className="font-semibold">{data.difference_percent}%</span> 더
            많은 유동인구
          </p>
        </div>
      </div>
    </div>
  )
}
