'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { RegionTrend } from '@/types/region'
import { formatCurrency, formatPriceChange } from '@/lib/format'

interface TrendCardProps {
  trend: RegionTrend
  index?: number
}

export function TrendCard({ trend, index = 0 }: TrendCardProps) {
  const isPositive = (trend.price_change_weekly ?? 0) > 0
  const isNegative = (trend.price_change_weekly ?? 0) < 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link
        href={`/search?region=${trend.id}`}
        className="block rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300"
      >
        {/* 지역명 */}
        <h3 className="text-base font-semibold text-gray-900">{trend.name}</h3>

        {/* 매물수 */}
        {trend.property_count !== undefined && (
          <span className="text-xs text-gray-500">
            {trend.property_count}건
          </span>
        )}

        {/* 평균 가격 */}
        <div className="mt-3">
          <span className="text-xl font-bold tabular-nums text-gray-900">
            {formatCurrency(trend.avg_price)}
          </span>
        </div>

        {/* 변동률 */}
        {trend.price_change_weekly !== null &&
          trend.price_change_weekly !== undefined && (
            <div className="mt-2">
              <span
                className={`text-sm ${
                  isPositive
                    ? 'text-green-500'
                    : isNegative
                      ? 'text-red-500'
                      : 'text-gray-500'
                }`}
              >
                {isPositive && '▲ '}
                {isNegative && '▼ '}
                {isPositive || isNegative
                  ? formatPriceChange(trend.price_change_weekly)
                  : '0.0%'}
              </span>
            </div>
          )}
      </Link>
    </motion.div>
  )
}
