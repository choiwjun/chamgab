'use client'

// @TASK P2-S1-T3 - 가격 트렌드 카드 (Editorial Luxury 스타일)
// @SPEC specs/screens/home.yaml#price_trends

import Link from 'next/link'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
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
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/search?region=${trend.id}`}
        className="group block relative bg-white border border-editorial-dark/5 hover:border-editorial-gold/50 transition-all duration-300"
      >
        {/* 호버 시 골드 라인 */}
        <div className="absolute top-0 left-0 w-0 h-0.5 bg-editorial-gold group-hover:w-full transition-all duration-500" />

        <div className="p-6 md:p-8">
          {/* 지역명 */}
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="font-serif text-xl md:text-2xl text-editorial-dark group-hover:text-editorial-gold transition-colors">
              {trend.name}
            </h3>
            {trend.property_count !== undefined && (
              <span className="text-xs tracking-wide text-editorial-ink/40">
                {trend.property_count}건
              </span>
            )}
          </div>

          {/* 평균 가격 - 대형 타이포 */}
          <div className="mb-4">
            <span className="text-xs tracking-wide uppercase text-editorial-ink/40 block mb-1">
              평균 시세
            </span>
            <p className="font-display text-3xl md:text-4xl text-editorial-dark tracking-tight">
              {formatCurrency(trend.avg_price)}
            </p>
          </div>

          {/* 가격 변동률 */}
          {trend.price_change_weekly !== null &&
            trend.price_change_weekly !== undefined && (
              <div className="flex items-center gap-3 pt-4 border-t border-editorial-dark/5">
                {isPositive && (
                  <>
                    <TrendingUp className="w-4 h-4 text-chamgab-up" />
                    <span className="font-medium text-chamgab-up">
                      {formatPriceChange(trend.price_change_weekly)}
                    </span>
                  </>
                )}
                {isNegative && (
                  <>
                    <TrendingDown className="w-4 h-4 text-chamgab-down" />
                    <span className="font-medium text-chamgab-down">
                      {formatPriceChange(trend.price_change_weekly)}
                    </span>
                  </>
                )}
                {!isPositive && !isNegative && (
                  <span className="text-editorial-ink/50">변동 없음</span>
                )}
                <span className="text-xs text-editorial-ink/40 ml-auto">주간 변동</span>
              </div>
            )}
        </div>
      </Link>
    </motion.div>
  )
}
