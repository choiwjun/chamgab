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
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        <div className="mb-6">
          <h2 className="mb-2 text-3xl font-bold text-gray-900">
            {industry_name}
          </h2>
          <p className="text-gray-600">전국 업종 통계 및 현황</p>
        </div>

        {/* 주요 지표 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* 총 점포수 */}
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Store className="h-6 w-6 text-blue-600" />
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
          <div className="rounded-xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">
                  평균 생존율
                </h3>
                <p className="text-3xl font-bold text-gray-900">
                  {avg_survival_rate.toFixed(1)}
                  <span className="text-lg text-gray-500">%</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">3년 기준</p>
          </div>

          {/* 평균 월매출 */}
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Target className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600">
                  평균 월매출
                </h3>
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
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        <div className="mb-6 flex items-center gap-3">
          <MapPin className="h-6 w-6 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              추천 상권 TOP {top_regions.length}
            </h2>
            <p className="text-gray-600">성공 확률이 높은 상권 순위</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {top_regions.map((region, index) => (
            <div
              key={region.district_code}
              className={`rounded-xl border-2 p-6 transition-all hover:shadow-lg ${
                index === 0
                  ? 'border-yellow-300 bg-gradient-to-br from-yellow-50 to-white'
                  : index === 1
                    ? 'border-gray-300 bg-gradient-to-br from-gray-50 to-white'
                    : index === 2
                      ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-white'
                      : 'border-gray-200 bg-white'
              }`}
            >
              {/* 순위 배지 */}
              <div className="mb-4 flex items-center justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
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
                <h3 className="mb-1 text-lg font-bold text-gray-900">
                  {region.district_name}
                </h3>
                <p className="text-sm text-gray-500">{region.district_code}</p>
              </div>

              {/* 프로그레스 바 */}
              <div className="mt-4">
                <div className="h-2 w-full rounded-full bg-gray-200">
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
