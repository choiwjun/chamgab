'use client'

import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'
import { PropertyCard } from '@/components/common/PropertyCard'
import type { Property } from '@/types/property'

interface PopularPropertiesClientProps {
  properties: Property[]
}

export function PopularPropertiesClient({
  properties,
}: PopularPropertiesClientProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })
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

    const scrollAmount = 340
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (properties.length === 0) {
    return (
      <section className="bg-[#F9FAFB] py-20">
        <div className="mx-auto max-w-7xl px-6 md:px-8">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
              주목받는 매물
            </h2>
          </div>
          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-12 text-center">
            <p className="text-[#8B95A1]">
              인기 매물 데이터를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={sectionRef}
      className="overflow-hidden bg-[#F9FAFB] py-20 md:py-24"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.3 }}
          className="mb-8 flex items-end justify-between"
        >
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
              주목받는 매물
            </h2>
            <p className="mt-2 text-sm text-[#8B95A1]">
              최근 등록된 매물을 확인해보세요
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* 스크롤 네비게이션 */}
            <div className="hidden items-center gap-1.5 md:flex">
              <button
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                  canScrollLeft
                    ? 'border-[#E5E8EB] text-[#191F28] hover:bg-[#F2F4F6]'
                    : 'cursor-not-allowed border-[#E5E8EB] opacity-40'
                } `}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                  canScrollRight
                    ? 'border-[#E5E8EB] text-[#191F28] hover:bg-[#F2F4F6]'
                    : 'cursor-not-allowed border-[#E5E8EB] opacity-40'
                } `}
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            <Link
              href="/search"
              className="text-sm text-[#8B95A1] transition-colors hover:text-[#191F28]"
            >
              전체 매물 →
            </Link>
          </div>
        </motion.div>

        {/* 매물 카드 캐러셀 */}
        <div className="relative">
          {/* Left fade */}
          <div className="pointer-events-none absolute left-0 top-0 z-10 hidden h-full w-8 bg-gradient-to-r from-[#F9FAFB] to-transparent md:block" />
          {/* Right fade */}
          <div className="pointer-events-none absolute right-0 top-0 z-10 hidden h-full w-8 bg-gradient-to-l from-[#F9FAFB] to-transparent md:block" />

          <div
            ref={scrollContainerRef}
            onScroll={checkScrollPosition}
            className="scrollbar-hide -mx-6 flex snap-x gap-4 overflow-x-auto px-6 pb-4 md:-mx-8 md:px-8"
          >
            {properties.map((property, index) => (
              <div key={property.id} className="snap-start">
                <PropertyCard property={property} index={index} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
