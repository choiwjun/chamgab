'use client'

import {
  TrendingUp,
  Users,
  MapPin,
  Home,
  AlertTriangle,
  DollarSign,
} from 'lucide-react'
import type {
  DistrictStatistics,
  DistrictCharacteristics,
} from '@/types/commercial'

interface MetricsCardProps {
  statistics: DistrictStatistics
  characteristics?: DistrictCharacteristics
}

export function MetricsCard({ statistics, characteristics }: MetricsCardProps) {
  const { survival_rate, monthly_avg_sales, competition_ratio, total_stores } =
    statistics

  const peak_time_traffic = characteristics?.peak_time_traffic ?? 0

  // 경쟁 강도 계산 (competition_ratio 기반)
  const getCompetitionLevel = (ratio: number) => {
    if (ratio >= 1.5) return { label: '높음', color: 'text-red-600 bg-red-50' }
    if (ratio >= 1.0)
      return { label: '중간', color: 'text-yellow-600 bg-yellow-50' }
    return { label: '낮음', color: 'text-green-600 bg-green-50' }
  }

  // 리스크 점수 계산 (100점 만점에서 역산)
  const calculateRisk = () => {
    let risk = 0
    // 생존율이 낮을수록 리스크 증가
    risk += (100 - survival_rate) * 0.3
    // 경쟁도가 높을수록 리스크 증가
    risk += competition_ratio * 10
    // 점포수가 많을수록 리스크 증가 (시장 포화)
    risk += Math.min(total_stores / 10, 20)
    return Math.min(risk, 100).toFixed(1)
  }

  // 매출 예측 (월평균 매출)
  const estimatedSales = monthly_avg_sales

  // 유동인구 (총 합산)
  const totalTraffic = peak_time_traffic * 4 // 피크 타임의 약 4배로 추정

  const competitionLevel = getCompetitionLevel(competition_ratio)
  const riskScore = calculateRisk()

  // 접근성과 임대료는 별도 데이터 소스 필요
  const accessibility = '데이터 수집 예정'
  const monthlyRent = '데이터 수집 예정'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8">
      <h2 className="mb-6 text-2xl font-bold text-gray-900">상세 지표</h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 3년 생존율 */}
        <div className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-blue-300">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">3년 생존율</h3>
              <p className="text-2xl font-bold text-gray-900">
                {survival_rate.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">업종 평균: 68%</p>
        </div>

        {/* 경쟁 강도 */}
        <div className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-blue-300">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">경쟁 강도</h3>
              <p className="text-2xl font-bold text-gray-900">
                {competitionLevel.label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${competitionLevel.color}`}
            >
              경쟁지수 {competition_ratio.toFixed(1)}
            </span>
            <span className="text-xs text-gray-500">
              (해당 상권 내 {total_stores.toLocaleString()}개 점포)
            </span>
          </div>
        </div>

        {/* 유동인구 */}
        <div className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-blue-300">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">유동인구</h3>
              <p className="text-2xl font-bold text-gray-900">
                {totalTraffic.toLocaleString()}명
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            일평균 (피크 시간대: {peak_time_traffic.toLocaleString()}명)
          </p>
        </div>

        {/* 접근성 */}
        <div className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-blue-300">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <MapPin className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">접근성</h3>
              <p className="text-xl font-bold text-gray-900">{accessibility}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">대중교통 우수</p>
        </div>

        {/* 매출 예측 */}
        <div className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-blue-300">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">매출 예측</h3>
              <p className="text-2xl font-bold text-gray-900">
                월 {(estimatedSales / 10000).toFixed(0)}만원
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">상권 평균 기준</p>
        </div>

        {/* 임대료 */}
        <div className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-blue-300">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2">
              <Home className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">임대료</h3>
              <p className="text-xl font-bold text-gray-900">{monthlyRent}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">보증금 별도</p>
        </div>
      </div>

      {/* 리스크 점수 */}
      <div className="mt-6 rounded-xl border border-red-100 bg-gradient-to-r from-red-50 to-orange-50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600">종합 리스크</h3>
              <p className="text-2xl font-bold text-red-600">{riskScore}점</p>
            </div>
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs text-gray-600">100점 만점</p>
            <p className="text-xs text-gray-500">
              {parseFloat(riskScore) < 30
                ? '낮음'
                : parseFloat(riskScore) < 60
                  ? '중간'
                  : '높음'}
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-1000"
            style={{ width: `${riskScore}%` }}
          />
        </div>
      </div>
    </div>
  )
}
