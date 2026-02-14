'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  MapPin,
  Calendar,
  Maximize2,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react'
import type { LandParcel, LandTransaction } from '@/types/land'
import { LAND_CATEGORY_LABELS } from '@/types/land'
import { formatNumber } from '@/lib/format'

interface LandDetailClientProps {
  parcel: LandParcel
  transactions: LandTransaction[]
  nearbyTransactions: LandTransaction[]
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatPyeong(m2: number) {
  return (m2 / 3.305785).toFixed(1)
}

function formatPrice(price: number) {
  const eok = Math.floor(price / 10000)
  const man = price % 10000
  if (eok > 0 && man > 0)
    return `${formatNumber(eok)}억 ${formatNumber(man)}만원`
  if (eok > 0) return `${formatNumber(eok)}억원`
  return `${formatNumber(man)}만원`
}

export function LandDetailClient({
  parcel,
  transactions,
  nearbyTransactions,
}: LandDetailClientProps) {
  // Compute price trend from transactions
  const pricesOverTime = transactions
    .filter((tx) => tx.price_per_m2)
    .sort(
      (a, b) =>
        new Date(a.transaction_date).getTime() -
        new Date(b.transaction_date).getTime()
    )

  const recentAvg =
    pricesOverTime.length > 0
      ? Math.round(
          pricesOverTime
            .slice(-5)
            .reduce((s, tx) => s + (tx.price_per_m2 || 0), 0) /
            Math.min(5, pricesOverTime.length)
        )
      : null

  const olderAvg =
    pricesOverTime.length > 5
      ? Math.round(
          pricesOverTime
            .slice(0, -5)
            .reduce((s, tx) => s + (tx.price_per_m2 || 0), 0) /
            (pricesOverTime.length - 5)
        )
      : null

  const priceTrend =
    recentAvg && olderAvg && olderAvg > 0
      ? ((recentAvg - olderAvg) / olderAvg) * 100
      : null

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Back navigation */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          href="/land/search"
          className="inline-flex items-center gap-2 text-sm text-[#8B95A1] transition-colors hover:text-[#191F28]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          토지 검색으로 돌아가기
        </Link>
      </motion.div>

      {/* Header section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-[#F59E0B]" strokeWidth={2} />
              <h1 className="text-2xl font-bold text-[#191F28]">
                {parcel.sido} {parcel.sigungu} {parcel.eupmyeondong}
              </h1>
            </div>
            {parcel.jibun && (
              <p className="ml-7 mt-1 text-[#4E5968]">{parcel.jibun}</p>
            )}
          </div>

          {parcel.land_category && (
            <span className="rounded-xl bg-[#FFF7ED] px-4 py-2 text-sm font-semibold text-[#F59E0B]">
              {LAND_CATEGORY_LABELS[parcel.land_category] ||
                parcel.land_category}
            </span>
          )}
        </div>
      </motion.div>

      {/* Key metrics */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        {/* Area */}
        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
            <Maximize2 className="h-3 w-3" strokeWidth={2} />
            면적
          </div>
          <p className="mt-2 text-xl font-bold text-[#191F28]">
            {parcel.area_m2 ? `${formatNumber(parcel.area_m2)}m²` : '-'}
          </p>
          {parcel.area_m2 && (
            <p className="text-xs text-[#8B95A1]">
              ({formatPyeong(parcel.area_m2)}평)
            </p>
          )}
        </div>

        {/* Latest transaction price */}
        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
            <BarChart3 className="h-3 w-3" strokeWidth={2} />
            최근 거래가
          </div>
          <p className="mt-2 text-xl font-bold text-[#191F28]">
            {parcel.latest_transaction_price
              ? formatPrice(parcel.latest_transaction_price)
              : '-'}
          </p>
          {parcel.latest_transaction_date && (
            <p className="text-xs text-[#8B95A1]">
              {formatDate(parcel.latest_transaction_date)}
            </p>
          )}
        </div>

        {/* Price per m2 */}
        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="text-xs text-[#8B95A1]">단가 (원/m²)</div>
          <p className="mt-2 text-xl font-bold text-[#F59E0B]">
            {parcel.latest_price_per_m2
              ? `${formatNumber(Math.floor(parcel.latest_price_per_m2 / 10000))}만원`
              : '-'}
          </p>
          <p className="text-xs text-[#8B95A1]">/m²</p>
        </div>

        {/* Price trend */}
        <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="text-xs text-[#8B95A1]">가격 추세</div>
          {priceTrend !== null ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                {priceTrend >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-[#00C471]" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-[#F04452]" />
                )}
                <span
                  className={`text-xl font-bold ${
                    priceTrend >= 0 ? 'text-[#00C471]' : 'text-[#F04452]'
                  }`}
                >
                  {priceTrend >= 0 ? '+' : ''}
                  {priceTrend.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-[#8B95A1]">최근 대비 이전</p>
            </>
          ) : (
            <p className="mt-2 text-xl font-bold text-[#8B95A1]">-</p>
          )}
        </div>
      </motion.div>

      {/* Transaction History */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-8"
      >
        <h2 className="text-lg font-bold text-[#191F28]">
          거래 이력
          <span className="ml-2 text-sm font-normal text-[#8B95A1]">
            {transactions.length}건
          </span>
        </h2>

        {transactions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#E5E8EB] bg-white p-8 text-center">
            <p className="text-[#8B95A1]">거래 이력이 없습니다</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all hover:border-[#D1D6DB]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-[#191F28]">
                        {formatPrice(tx.price)}
                      </span>
                      {tx.price_per_m2 && (
                        <span className="text-sm text-[#F59E0B]">
                          {formatNumber(Math.floor(tx.price_per_m2 / 10000))}
                          만원/m²
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#8B95A1]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" strokeWidth={2} />
                        {formatDate(tx.transaction_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Maximize2 className="h-3 w-3" strokeWidth={2} />
                        {formatNumber(tx.area_m2)}m² ({formatPyeong(tx.area_m2)}
                        평)
                      </span>
                      {tx.transaction_type && (
                        <span className="rounded-md bg-[#F2F4F6] px-2 py-0.5 text-xs">
                          {tx.transaction_type}
                        </span>
                      )}
                      {tx.is_partial_sale && (
                        <span className="rounded-md bg-[#FFF0F0] px-2 py-0.5 text-xs text-[#F04452]">
                          지분매매
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Nearby Transactions */}
      {nearbyTransactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-8"
        >
          <h2 className="text-lg font-bold text-[#191F28]">
            인근 거래
            <span className="ml-2 text-sm font-normal text-[#8B95A1]">
              {parcel.eupmyeondong} 일대
            </span>
          </h2>

          <div className="mt-4 space-y-3">
            {nearbyTransactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all hover:border-[#D1D6DB]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin
                        className="h-3.5 w-3.5 text-[#8B95A1]"
                        strokeWidth={2}
                      />
                      <span className="text-sm font-medium text-[#4E5968]">
                        {tx.eupmyeondong} {tx.jibun}
                      </span>
                      {tx.land_category && (
                        <span className="rounded-md bg-[#FFF7ED] px-2 py-0.5 text-xs text-[#F59E0B]">
                          {LAND_CATEGORY_LABELS[tx.land_category] ||
                            tx.land_category}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-bold text-[#191F28]">
                        {formatPrice(tx.price)}
                      </span>
                      {tx.price_per_m2 && (
                        <span className="text-sm text-[#8B95A1]">
                          {formatNumber(Math.floor(tx.price_per_m2 / 10000))}
                          만원/m²
                        </span>
                      )}
                      <span className="text-xs text-[#8B95A1]">
                        {formatDate(tx.transaction_date)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
