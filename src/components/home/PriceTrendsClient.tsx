'use client'

// @TASK P2-S1-T3 - 가격 트렌드 섹션 클라이언트 (Editorial Luxury 스타일)
// @SPEC specs/screens/home.yaml#price_trends

import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { TrendCard } from './TrendCard'
import type { RegionTrend } from '@/types/region'

interface PriceTrendsClientProps {
  trends: RegionTrend[]
}

export function PriceTrendsClient({ trends }: PriceTrendsClientProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" })

  if (trends.length === 0) {
    return (
      <section className="py-24 md:py-32 bg-editorial-bg">
        <div className="mx-auto max-w-7xl px-6 md:px-8">
          <h2 className="font-serif text-3xl text-editorial-dark mb-8">
            지역별 가격 트렌드
          </h2>
          <div className="border border-editorial-dark/10 p-12 text-center">
            <p className="text-editorial-ink/50">
              가격 트렌드 데이터를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32 bg-white overflow-hidden">
      {/* 배경 장식 */}
      <div className="absolute top-0 left-0 w-full h-px bg-editorial-dark/5" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-editorial-dark/5" />

      <div className="relative mx-auto max-w-7xl px-6 md:px-8">
        {/* 섹션 헤더 */}
        <div className="grid md:grid-cols-12 gap-8 md:gap-12 mb-16 md:mb-20">
          {/* 좌측: 섹션 라벨 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="md:col-span-3"
          >
            <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              <span className="w-8 h-px bg-editorial-gold" />
              Market Trends
            </span>
          </motion.div>

          {/* 우측: 메인 타이틀 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="md:col-span-9 flex flex-col md:flex-row md:items-end md:justify-between"
          >
            <div>
              <h2 className="font-serif text-4xl md:text-5xl text-editorial-dark leading-tight tracking-tight">
                지역별 시세 동향
              </h2>
              <p className="mt-4 text-editorial-ink/60 max-w-xl">
                실거래가 데이터 기반의 정확한 지역별 가격 트렌드를 확인하세요.
              </p>
            </div>

            <Link
              href={'/search' as const}
              className="mt-6 md:mt-0 inline-flex items-center gap-2 text-sm text-editorial-gold hover:text-editorial-dark transition-colors group"
            >
              <span>전체 지역 보기</span>
              <svg
                className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </motion.div>
        </div>

        {/* 트렌드 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-editorial-dark/5">
          {trends.map((trend, index) => (
            <TrendCard key={trend.id} trend={trend} index={index} />
          ))}
        </div>

        {/* 하단 장식 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 0.02 } : {}}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute -bottom-20 -left-20 font-display text-[15rem] text-editorial-dark leading-none pointer-events-none select-none"
        >
          %
        </motion.div>
      </div>
    </section>
  )
}
