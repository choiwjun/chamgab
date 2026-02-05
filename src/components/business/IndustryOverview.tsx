'use client'

import { Store, TrendingUp, MapPin, Target } from 'lucide-react'
import type { IndustryStatistics } from '@/types/commercial'

interface IndustryOverviewProps {
  statistics: IndustryStatistics
}

export function IndustryOverview({ statistics }: IndustryOverviewProps) {
  const {
    industry_name,
    total_stores,
    avg_survival_rate,
    avg_monthly_sales,
    top_regions,
  } = statistics

  return (
    <div className="space-y-8">
      {/* 업종 개요 */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{industry_name}</h2>
          <p className="text-gray-600">전국 업종 통계 및 현황</p>
        </div>

        {/* 주요 지표 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 총 점포수 */}
          <div className="p-6 bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Store className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">총 점포수</h3>
                <p className="text-3xl font-bold text-gray-900">
                  {total_stores.toLocaleString()}
                  <span className="text-lg text-gray-500">개</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">전국 기준</p>
          </div>

          {/* 평균 생존율 */}
          <div className="p-6 bg-gradient-to-br from-green-50 to-white rounded-xl border border-green-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">평균 생존율</h3>
                <p className="text-3xl font-bold text-gray-900">
                  {avg_survival_rate.toFixed(1)}
                  <span className="text-lg text-gray-500">%</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">3년 기준</p>
          </div>

          {/* 평균 월매출 */}
          <div className="p-6 bg-gradient-to-br from-purple-50 to-white rounded-xl border border-purple-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">평균 월매출</h3>
                <p className="text-3xl font-bold text-gray-900">
                  {(avg_monthly_sales / 10000).toFixed(0)}
                  <span className="text-lg text-gray-500">만원</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">전국 평균</p>
          </div>
        </div>
      </div>

      {/* 상위 지역 */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="w-6 h-6 text-primary-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">추천 상권 TOP {top_regions.length}</h2>
            <p className="text-gray-600">성공 확률이 높은 상권 순위</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {top_regions.map((region, index) => (
            <div
              key={region.district_code}
              className={`p-6 rounded-xl border-2 transition-all hover:shadow-lg ${
                index === 0
                  ? 'bg-gradient-to-br from-yellow-50 to-white border-yellow-300'
                  : index === 1
                    ? 'bg-gradient-to-br from-gray-50 to-white border-gray-300'
                    : index === 2
                      ? 'bg-gradient-to-br from-orange-50 to-white border-orange-300'
                      : 'bg-white border-gray-200'
              }`}
            >
              {/* 순위 배지 */}
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    index === 0
                      ? 'bg-yellow-400 text-white'
                      : index === 1
                        ? 'bg-gray-400 text-white'
                        : index === 2
                          ? 'bg-orange-400 text-white'
                          : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {index + 1}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {region.success_probability.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">성공 확률</div>
                </div>
              </div>

              {/* 상권명 */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">{region.district_name}</h3>
                <p className="text-sm text-gray-500">{region.district_code}</p>
              </div>

              {/* 프로그레스 바 */}
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      index === 0
                        ? 'bg-yellow-400'
                        : index === 1
                          ? 'bg-gray-400'
                          : index === 2
                            ? 'bg-orange-400'
                            : 'bg-blue-500'
                    }`}
                    style={{ width: `${region.success_probability}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
