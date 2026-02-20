'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { MapPin, TrendingUp } from 'lucide-react'
import type { LandRegionStats } from '@/types/land'
import { formatNumber } from '@/lib/format'

interface LandRegionTrendsProps {
  stats: LandRegionStats[]
}

export function LandRegionTrends({ stats }: LandRegionTrendsProps) {
  if (stats.length === 0) {
    return (
      <section className="bg-[#F9FAFB] py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
            지역별 토지 시세
          </h2>
          <div className="mt-8 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF7ED]">
              <MapPin className="h-8 w-8 text-[#F59E0B]" strokeWidth={2} />
            </div>
            <p className="mt-4 text-[#8B95A1]">
              토지 거래 데이터를 불러오는 중입니다
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-[#F9FAFB] py-16 md:py-20">
      <div className="mx-auto max-w-5xl px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
                지역별 토지 시세
              </h2>
              <p className="mt-2 text-[#4E5968]">
                최근 거래가 활발한 지역의 평균 단가
              </p>
            </div>
            <Link
              href="/land/search"
              className="hidden text-sm font-medium text-[#F59E0B] hover:text-[#EA8A0C] md:block"
            >
              전체보기 →
            </Link>
          </div>
        </motion.div>

        {/* Cards grid */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.sigungu}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
            >
              <Link
                href={
                  `/land/search?sigungu=${encodeURIComponent(stat.sigungu)}` as never
                }
                className="block rounded-2xl border border-[#E5E8EB] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F59E0B]/30"
              >
                {/* Region name + transaction count */}
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-[#191F28]">
                    {stat.sigungu}
                  </h3>
                  <span className="h-1 w-1 rounded-full bg-[#D1D6DB]" />
                  <span className="text-xs text-[#8B95A1]">
                    {formatNumber(stat.transaction_count)}건
                  </span>
                </div>

                {/* Average price per m2 */}
                <div className="mt-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums text-[#191F28]">
                      {formatNumber(Math.floor(stat.avg_price_per_m2 / 10000))}
                    </span>
                    <span className="text-sm text-[#8B95A1]">만원/m²</span>
                  </div>
                </div>

                {/* Trending indicator */}
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 text-xs text-[#8B95A1]">
                    <TrendingUp className="h-3 w-3" strokeWidth={2} />
                    최근 {formatNumber(stat.transaction_count)}건 거래
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Mobile view all button */}
        <div className="mt-6 text-center md:hidden">
          <Link
            href="/land/search"
            className="text-sm font-medium text-[#F59E0B] hover:text-[#EA8A0C]"
          >
            전체보기 →
          </Link>
        </div>
      </div>
    </section>
  )
}
