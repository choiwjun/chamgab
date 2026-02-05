'use client'

// @TASK P2-S1-T4 - 인기 매물 섹션 클라이언트 (Editorial Luxury 스타일)
// @SPEC specs/screens/home.yaml#popular_properties

import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'
import { PropertyCard } from '@/components/common/PropertyCard'
import type { Property } from '@/types/property'

interface PopularPropertiesClientProps {
  properties: Property[]
}

export function PopularPropertiesClient({ properties }: PopularPropertiesClientProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" })
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScrollPosition = () => {
    const container = scrollContainerRef.current
    if (!container) return

    setCanScrollLeft(container.scrollLeft > 0)
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    )
  }

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current
    if (!container) return

    const scrollAmount = 360
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (properties.length === 0) {
    return (
      <section className="py-24 md:py-32 bg-editorial-sand/30">
        <div className="mx-auto max-w-7xl px-6 md:px-8">
          <h2 className="font-serif text-3xl text-editorial-dark mb-8">
            인기 매물
          </h2>
          <div className="border border-editorial-dark/10 bg-white p-12 text-center">
            <p className="text-editorial-ink/50">
              인기 매물 데이터를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32 bg-editorial-sand/30 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* 섹션 헤더 */}
        <div className="grid md:grid-cols-12 gap-8 md:gap-12 mb-12 md:mb-16">
          {/* 좌측: 섹션 라벨 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="md:col-span-3"
          >
            <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              <span className="w-8 h-px bg-editorial-gold" />
              Featured
            </span>
          </motion.div>

          {/* 우측: 메인 타이틀 + 네비게이션 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="md:col-span-9 flex flex-col md:flex-row md:items-end md:justify-between"
          >
            <div>
              <h2 className="font-serif text-4xl md:text-5xl text-editorial-dark leading-tight tracking-tight">
                주목받는 매물
              </h2>
              <p className="mt-4 text-editorial-ink/60 max-w-xl">
                가장 많은 관심을 받고 있는 프리미엄 매물을 소개합니다.
              </p>
            </div>

            {/* 네비게이션 */}
            <div className="mt-6 md:mt-0 flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => scroll('left')}
                  disabled={!canScrollLeft}
                  className={`
                    w-10 h-10 border flex items-center justify-center transition-all
                    ${canScrollLeft
                      ? 'border-editorial-dark/20 text-editorial-dark hover:bg-editorial-dark hover:text-white'
                      : 'border-editorial-dark/10 text-editorial-dark/20 cursor-not-allowed'
                    }
                  `}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => scroll('right')}
                  disabled={!canScrollRight}
                  className={`
                    w-10 h-10 border flex items-center justify-center transition-all
                    ${canScrollRight
                      ? 'border-editorial-dark/20 text-editorial-dark hover:bg-editorial-dark hover:text-white'
                      : 'border-editorial-dark/10 text-editorial-dark/20 cursor-not-allowed'
                    }
                  `}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <Link
                href="/search"
                className="inline-flex items-center gap-2 text-sm text-editorial-gold hover:text-editorial-dark transition-colors group"
              >
                <span>전체 매물 보기</span>
                <svg
                  className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* 매물 카드 캐러셀 */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScrollPosition}
          className="scrollbar-hide -mx-6 md:-mx-8 flex gap-6 overflow-x-auto px-6 md:px-8 pb-4 snap-x"
        >
          {properties.map((property, index) => (
            <div key={property.id} className="snap-start">
              <PropertyCard property={property} index={index} />
            </div>
          ))}
        </div>

        {/* 모바일 스와이프 힌트 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5 }}
          className="mt-6 flex justify-center md:hidden"
        >
          <span className="text-xs tracking-wide text-editorial-ink/40">
            스와이프하여 더 보기
          </span>
        </motion.div>
      </div>
    </section>
  )
}
