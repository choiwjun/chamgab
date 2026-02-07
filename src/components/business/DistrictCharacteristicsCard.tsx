'use client'

import {
  Users,
  Clock,
  TrendingUp,
  Briefcase,
  Home,
  GraduationCap,
  DollarSign,
  Target,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { DistrictCharacteristics } from '@/types/commercial'

interface DistrictCharacteristicsCardProps {
  characteristics: DistrictCharacteristics
}

export function DistrictCharacteristicsCard({
  characteristics,
}: DistrictCharacteristicsCardProps) {
  const {
    district_name,
    district_type,
    primary_age_group,
    primary_age_ratio,
    office_worker_ratio,
    resident_ratio,
    student_ratio,
    peak_time_start,
    peak_time_end,
    time_distribution,
    age_distribution,
    avg_ticket_price,
    consumption_level,
    weekday_dominant,
    weekend_sales_ratio,
    recommended_business_hours,
    target_customer_profile,
  } = characteristics

  // 상권 유형 아이콘
  const getDistrictTypeIcon = () => {
    if (district_type.includes('대학'))
      return <GraduationCap className="h-5 w-5" />
    if (district_type.includes('오피스'))
      return <Briefcase className="h-5 w-5" />
    if (district_type.includes('주거')) return <Home className="h-5 w-5" />
    return <Users className="h-5 w-5" />
  }

  // 시간대별 데이터 변환
  const timeChartData = time_distribution.map((item) => ({
    name: item.time_slot,
    value: item.traffic_count,
    percentage: item.percentage,
  }))

  // 연령대별 데이터 변환
  const ageChartData = age_distribution.map((item) => ({
    name: item.age_group,
    value: item.percentage,
    count: item.count,
  }))

  // 차트 색상
  const COLORS = [
    '#3b82f6',
    '#60a5fa',
    '#93c5fd',
    '#bfdbfe',
    '#00C471',
    '#3b82f6',
  ]

  return (
    <div className="space-y-8 rounded-xl border border-gray-200 bg-white p-8">
      {/* 헤더 */}
      <div>
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          상권 특성 분석
        </h2>
        <p className="text-gray-600">
          {district_name}의 상세한 특성을 분석했습니다.
        </p>
      </div>

      {/* 상권 유형 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              {getDistrictTypeIcon()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">상권 유형</h3>
              <p className="text-2xl font-bold text-blue-600">
                {district_type}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">{target_customer_profile}</p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">타겟 연령대</h3>
              <p className="text-2xl font-bold text-blue-600">
                {primary_age_group}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            전체의 {primary_age_ratio.toFixed(1)}%를 차지
          </p>
        </div>
      </div>

      {/* 인구 구성 */}
      <div>
        <h3 className="mb-4 font-semibold text-gray-900">인구 구성</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-50 p-4 text-center">
            <Briefcase className="mx-auto mb-2 h-6 w-6 text-gray-600" />
            <div className="text-2xl font-bold text-gray-900">
              {office_worker_ratio.toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">직장인구</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 text-center">
            <Home className="mx-auto mb-2 h-6 w-6 text-gray-600" />
            <div className="text-2xl font-bold text-gray-900">
              {resident_ratio.toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">주거인구</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 text-center">
            <GraduationCap className="mx-auto mb-2 h-6 w-6 text-gray-600" />
            <div className="text-2xl font-bold text-gray-900">
              {student_ratio.toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">학생</div>
          </div>
        </div>
      </div>

      {/* 피크 타임 & 객단가 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">피크 타임</h3>
              <p className="text-2xl font-bold text-green-600">
                {peak_time_start} - {peak_time_end}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            추천 영업 시간: {recommended_business_hours}
          </p>
        </div>

        <div className="rounded-xl border border-yellow-100 bg-gradient-to-br from-yellow-50 to-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">평균 객단가</h3>
              <p className="text-2xl font-bold text-yellow-600">
                {avg_ticket_price.toLocaleString()}원
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            소비 수준: {consumption_level}
          </p>
        </div>
      </div>

      {/* 시간대별 유동인구 */}
      <div>
        <h3 className="mb-4 font-semibold text-gray-900">시간대별 유동인구</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeChartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (
                    active &&
                    payload &&
                    payload.length &&
                    payload[0]?.value !== undefined
                  ) {
                    return (
                      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                        <p className="font-semibold text-gray-900">
                          {payload[0].payload.name}
                        </p>
                        <p className="text-sm text-gray-600">
                          {payload[0].value.toLocaleString()}명
                        </p>
                        <p className="text-sm text-gray-600">
                          ({payload[0].payload.percentage.toFixed(1)}%)
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {timeChartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 연령대별 분포 */}
      <div>
        <h3 className="mb-4 font-semibold text-gray-900">연령대별 분포</h3>
        <div className="space-y-3">
          {ageChartData.map((item, index) => (
            <div key={index}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {item.name}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {item.value.toFixed(1)}% ({item.count.toLocaleString()}명)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${item.value}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 요일 특성 */}
      <div className="rounded-xl bg-gray-50 p-6">
        <div className="mb-3 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">요일 특성</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-sm text-gray-600">주중/주말 패턴</p>
            <p className="font-semibold text-gray-900">
              {weekday_dominant ? '주중 우세' : '주말 우세'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-sm text-gray-600">주말 매출 비중</p>
            <p className="font-semibold text-gray-900">
              {weekend_sales_ratio.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
