'use client'

import { TrendingUp, TrendingDown, Trophy, Award, Medal } from 'lucide-react'
import type { RegionComparison } from '@/types/commercial'

interface ComparisonTableProps {
  comparisons: RegionComparison[]
  industryName: string
}

export function ComparisonTable({ comparisons, industryName }: ComparisonTableProps) {
  // 순위 아이콘
  const getRankIcon = (ranking: number) => {
    switch (ranking) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />
      case 2:
        return <Award className="w-5 h-5 text-gray-400" />
      case 3:
        return <Medal className="w-5 h-5 text-orange-600" />
      default:
        return <span className="text-gray-500 font-semibold">#{ranking}</span>
    }
  }

  // 성공 확률 색상
  const getProbabilityColor = (probability: number) => {
    if (probability >= 70) return 'text-green-600 bg-green-50'
    if (probability >= 50) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">지역 비교</h2>
        <p className="text-gray-600">{industryName} 업종의 지역별 창업 성공 확률 비교</p>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">순위</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">상권명</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">
                성공 확률
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">평가</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((comparison, index) => (
              <tr
                key={comparison.district_code}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  index === 0 ? 'bg-yellow-50/30' : ''
                }`}
              >
                {/* 순위 */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    {getRankIcon(comparison.ranking)}
                  </div>
                </td>

                {/* 상권명 */}
                <td className="px-4 py-4">
                  <div className="font-medium text-gray-900">{comparison.district_name}</div>
                  <div className="text-sm text-gray-500">{comparison.district_code}</div>
                </td>

                {/* 성공 확률 */}
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-semibold ${getProbabilityColor(comparison.success_probability)}`}
                    >
                      <span className="text-lg">{comparison.success_probability.toFixed(1)}%</span>
                    </div>
                  </div>
                </td>

                {/* 평가 */}
                <td className="px-4 py-4 text-center">
                  {comparison.success_probability >= 70 ? (
                    <div className="inline-flex items-center gap-1 text-green-600">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm font-medium">추천</span>
                    </div>
                  ) : comparison.success_probability >= 50 ? (
                    <div className="inline-flex items-center gap-1 text-yellow-600">
                      <span className="text-sm font-medium">검토</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 text-red-600">
                      <TrendingDown className="w-4 h-4" />
                      <span className="text-sm font-medium">비추천</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 요약 */}
      {comparisons.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 rounded-xl">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">추천 상권</h3>
              <p className="text-sm text-blue-700">
                <strong>{comparisons[0].district_name}</strong>이(가) 가장 높은 성공 확률(
                {comparisons[0].success_probability.toFixed(1)}%)을 보입니다.{' '}
                {comparisons[0].success_probability >= 70
                  ? '이 지역에서의 창업을 적극 추천합니다.'
                  : comparisons[0].success_probability >= 50
                    ? '추가 분석 후 결정하시는 것을 권장합니다.'
                    : '다른 지역을 고려해보시는 것이 좋습니다.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
