'use client'

// @TASK P2-S1-T3 - 가격 트렌드 카드
// @SPEC specs/screens/home.yaml#price_trends

import Link from 'next/link'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { RegionTrend } from '@/types/region'
import { formatCurrency, formatPriceChange } from '@/lib/format'

interface TrendCardProps {
  trend: RegionTrend
}

export function TrendCard({ trend }: TrendCardProps) {
  const isPositive = (trend.price_change_weekly ?? 0) > 0
  const isNegative = (trend.price_change_weekly ?? 0) < 0

  return (
    <Link
      href={`/search?region=${trend.id}`}
      className="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-primary hover:shadow-md"
    >
      {/* 지역명 */}
      <div className="mb-3 flex items-start justify-between">
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary">
          {trend.name}
        </h3>
        {trend.property_count !== undefined && (
          <span className="text-xs text-gray-500">{trend.property_count}건</span>
        )}
      </div>

      {/* 평균 가격 */}
      <div className="mb-2">
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(trend.avg_price)}
        </p>
      </div>

      {/* 가격 변동률 */}
      {trend.price_change_weekly !== null &&
        trend.price_change_weekly !== undefined && (
          <div className="flex items-center gap-1">
            {isPositive && (
              <>
                <TrendingUp className="h-4 w-4 text-chamgab-up" />
                <span className="text-sm font-medium text-chamgab-up">
                  {formatPriceChange(trend.price_change_weekly)}
                </span>
              </>
            )}
            {isNegative && (
              <>
                <TrendingDown className="h-4 w-4 text-chamgab-down" />
                <span className="text-sm font-medium text-chamgab-down">
                  {formatPriceChange(trend.price_change_weekly)}
                </span>
              </>
            )}
            {!isPositive && !isNegative && (
              <span className="text-sm text-chamgab-neutral">변동 없음</span>
            )}
            <span className="text-xs text-gray-500">주간</span>
          </div>
        )}
    </Link>
  )
}
