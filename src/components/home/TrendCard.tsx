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
        className="block rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D1D6DB]"
      >
        {/* 지역명 + 매물수 */}
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[#191F28]">
            {trend.name}
          </h3>
          {trend.property_count !== undefined && (
            <>
              <span className="h-1 w-1 rounded-full bg-[#D1D6DB]" />
              <span className="text-xs text-[#8B95A1]">
                {trend.property_count}건
              </span>
            </>
          )}
        </div>

        {/* 평균 가격 */}
        <div className="mt-3">
          <span className="text-xl font-bold tabular-nums text-[#191F28]">
            {formatCurrency(trend.avg_price)}
          </span>
        </div>

        {/* 변동률 pill */}
        {trend.price_change_weekly !== null &&
          trend.price_change_weekly !== undefined && (
            <div className="mt-2">
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isPositive
                    ? 'bg-[#E8FAF0] text-[#00C471]'
                    : isNegative
                      ? 'bg-[#FFF0F0] text-[#F04452]'
                      : 'bg-[#F2F4F6] text-[#8B95A1]'
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
