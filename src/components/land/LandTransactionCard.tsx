'use client'

import { motion } from 'framer-motion'
import { MapPin, Calendar, Maximize2 } from 'lucide-react'
import type { LandTransaction } from '@/types/land'
import { LAND_CATEGORY_LABELS } from '@/types/land'
import { formatNumber } from '@/lib/format'

interface LandTransactionCardProps {
  transaction: LandTransaction
  index?: number
}

export function LandTransactionCard({
  transaction: tx,
  index = 0,
}: LandTransactionCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatPyeong = (m2: number) => {
    return (m2 / 3.305785).toFixed(1)
  }

  const formatPrice = (price: number) => {
    const eok = Math.floor(price / 10000)
    const man = price % 10000

    if (eok > 0 && man > 0) {
      return `${formatNumber(eok)}억 ${formatNumber(man)}만원`
    } else if (eok > 0) {
      return `${formatNumber(eok)}억원`
    } else {
      return `${formatNumber(man)}만원`
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <div className="rounded-2xl border border-[#E5E8EB] bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F59E0B]/30 hover:shadow-sm">
        {/* Header: Location + Badge */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#F59E0B]" strokeWidth={2} />
              <h3 className="font-semibold text-[#191F28]">
                {tx.sido} {tx.sigungu}
              </h3>
            </div>
            <p className="mt-1 text-sm text-[#4E5968]">
              {tx.eupmyeondong} {tx.jibun}
            </p>
          </div>

          {/* Land category badge */}
          {tx.land_category && (
            <span className="rounded-lg bg-[#FFF7ED] px-3 py-1.5 text-xs font-semibold text-[#F59E0B]">
              {LAND_CATEGORY_LABELS[tx.land_category] || tx.land_category}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[#F2F4F6]" />

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Area */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
              <Maximize2 className="h-3 w-3" strokeWidth={2} />
              <span>면적</span>
            </div>
            <p className="mt-1.5 text-lg font-bold text-[#191F28]">
              {formatNumber(tx.area_m2)}m²
            </p>
            <p className="text-xs text-[#8B95A1]">
              ({formatPyeong(tx.area_m2)}평)
            </p>
          </div>

          {/* Transaction date */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
              <Calendar className="h-3 w-3" strokeWidth={2} />
              <span>거래일</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-[#4E5968]">
              {formatDate(tx.transaction_date)}
            </p>
          </div>
        </div>

        {/* Price Section */}
        <div className="mt-4 rounded-xl bg-[#F9FAFB] p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-[#8B95A1]">거래금액</p>
              <p className="mt-1 text-2xl font-bold text-[#191F28]">
                {formatPrice(tx.price)}
              </p>
            </div>
            {tx.price_per_m2 && (
              <div className="text-right">
                <p className="text-xs text-[#8B95A1]">단가</p>
                <p className="mt-1 text-lg font-semibold text-[#F59E0B]">
                  {formatNumber(Math.floor(tx.price_per_m2 / 10000))}만원
                  <span className="text-sm text-[#8B95A1]">/m²</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Additional info badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          {tx.is_partial_sale && (
            <span className="rounded-md bg-[#F2F4F6] px-2 py-1 text-xs text-[#8B95A1]">
              부분매매
            </span>
          )}
          {tx.transaction_type && (
            <span className="rounded-md bg-[#F2F4F6] px-2 py-1 text-xs text-[#8B95A1]">
              {tx.transaction_type}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
