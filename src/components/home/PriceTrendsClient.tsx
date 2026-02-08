'use client'

import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { TrendCard } from './TrendCard'
import type { RegionTrend } from '@/types/region'

interface PriceTrendsClientProps {
  trends: RegionTrend[]
}

export function PriceTrendsClient({ trends }: PriceTrendsClientProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(gridRef, { once: true, margin: '-100px' })

  if (trends.length === 0) {
    return (
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              지역별 시세 동향
            </h2>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-gray-500">
              가격 트렌드 데이터를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-gray-50 py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* 섹션 헤더 */}
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-bold text-gray-900">지역별 시세 동향</h2>
          <Link
            href={'/search' as const}
            className="text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            전체 지역 →
          </Link>
        </div>

        {/* 트렌드 카드 그리드 */}
        <motion.div
          ref={gridRef}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.4 }}
          className="grid gap-4 md:grid-cols-3"
        >
          {trends.map((trend, index) => (
            <TrendCard key={trend.id} trend={trend} index={index} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
