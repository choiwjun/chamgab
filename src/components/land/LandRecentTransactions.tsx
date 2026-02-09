'use client'

import { motion } from 'framer-motion'
import { FileText, Calendar, MapPin } from 'lucide-react'
import type { LandTransaction } from '@/types/land'
import { LAND_CATEGORY_LABELS } from '@/types/land'
import { formatNumber } from '@/lib/format'

interface LandRecentTransactionsProps {
  transactions: LandTransaction[]
}

export function LandRecentTransactions({
  transactions,
}: LandRecentTransactionsProps) {
  if (transactions.length === 0) {
    return (
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
            최근 거래
          </h2>
          <div className="mt-8 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F2F4F6]">
              <FileText className="h-8 w-8 text-[#8B95A1]" strokeWidth={2} />
            </div>
            <p className="mt-4 text-[#8B95A1]">
              최근 거래 내역을 불러오는 중입니다
            </p>
          </div>
        </div>
      </section>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatPyeong = (m2: number) => {
    return (m2 / 3.305785).toFixed(0)
  }

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="mx-auto max-w-5xl px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
            최근 거래
          </h2>
          <p className="mt-2 text-[#4E5968]">
            최신 토지 실거래 내역을 확인하세요
          </p>
        </motion.div>

        {/* Transactions list */}
        <div className="mt-8 space-y-3">
          {transactions.map((tx, index) => (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.03, duration: 0.3 }}
            >
              <div className="rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all duration-200 hover:border-[#D1D6DB]">
                {/* Location */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin
                        className="h-4 w-4 text-[#F59E0B]"
                        strokeWidth={2}
                      />
                      <h3 className="font-semibold text-[#191F28]">
                        {tx.sido} {tx.sigungu} {tx.eupmyeondong}
                      </h3>
                    </div>
                    {tx.jibun && (
                      <p className="mt-1 text-sm text-[#8B95A1]">{tx.jibun}</p>
                    )}
                  </div>

                  {/* Land category badge */}
                  {tx.land_category && (
                    <span className="rounded-lg bg-[#FFF7ED] px-3 py-1 text-xs font-medium text-[#F59E0B]">
                      {LAND_CATEGORY_LABELS[tx.land_category] ||
                        tx.land_category}
                    </span>
                  )}
                </div>

                {/* Details grid */}
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#F2F4F6] pt-4 md:grid-cols-4">
                  {/* Area */}
                  <div>
                    <p className="text-xs text-[#8B95A1]">면적</p>
                    <p className="mt-1 font-semibold text-[#191F28]">
                      {formatNumber(tx.area_m2)}m²
                    </p>
                    <p className="text-xs text-[#8B95A1]">
                      ({formatPyeong(tx.area_m2)}평)
                    </p>
                  </div>

                  {/* Price */}
                  <div>
                    <p className="text-xs text-[#8B95A1]">거래금액</p>
                    <p className="mt-1 font-semibold text-[#191F28]">
                      {formatNumber(Math.floor(tx.price / 10000))}억
                    </p>
                    <p className="text-xs text-[#8B95A1]">
                      {formatNumber(tx.price % 10000)}만원
                    </p>
                  </div>

                  {/* Price per m2 */}
                  <div>
                    <p className="text-xs text-[#8B95A1]">단가</p>
                    <p className="mt-1 font-semibold text-[#191F28]">
                      {tx.price_per_m2
                        ? `${formatNumber(Math.floor(tx.price_per_m2 / 10000))}만원`
                        : '-'}
                    </p>
                    <p className="text-xs text-[#8B95A1]">/m²</p>
                  </div>

                  {/* Transaction date */}
                  <div>
                    <p className="text-xs text-[#8B95A1]">거래일</p>
                    <div className="mt-1 flex items-center gap-1">
                      <Calendar
                        className="h-3 w-3 text-[#8B95A1]"
                        strokeWidth={2}
                      />
                      <p className="text-sm font-medium text-[#4E5968]">
                        {formatDate(tx.transaction_date)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
