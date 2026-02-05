// 단지 카드 컴포넌트 (Editorial Luxury 스타일)

'use client'

import Link from 'next/link'
import { MapPin, Building, Calendar, Car, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Complex } from '@/types/complex'
import { cn } from '@/lib/utils'

interface ComplexCardProps {
  complex: Complex
  className?: string
  index?: number
}

export function ComplexCard({
  complex,
  className,
  index = 0,
}: ComplexCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group', className)}
    >
      <Link
        href={`/complex/${complex.id}`}
        className="block h-full bg-white border border-editorial-dark/5 hover:border-editorial-gold/50 transition-all duration-300 relative"
      >
        {/* 상단 골드 라인 - 호버 시 */}
        <div className="absolute top-0 left-0 w-0 h-0.5 bg-editorial-gold group-hover:w-full transition-all duration-500" />

        <div className="p-6">
          {/* 상단: 지역 + 브랜드 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs tracking-[0.15em] uppercase text-editorial-gold">
                {complex.sigungu}
              </span>
              {complex.brand && (
                <>
                  <span className="text-editorial-dark/20">·</span>
                  <span className="text-xs text-editorial-ink/50">
                    {complex.brand}
                  </span>
                </>
              )}
            </div>
            <ArrowUpRight className="w-4 h-4 text-editorial-ink/20 group-hover:text-editorial-gold transition-colors" />
          </div>

          {/* 단지명 */}
          <h3 className="font-serif text-xl text-editorial-dark leading-tight mb-2 group-hover:text-editorial-gold transition-colors line-clamp-2">
            {complex.name}
          </h3>

          {/* 주소 */}
          <div className="flex items-start gap-1.5 mb-6">
            <MapPin className="w-3.5 h-3.5 text-editorial-ink/30 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-editorial-ink/50 line-clamp-1">
              {complex.address}
            </p>
          </div>

          {/* 구분선 */}
          <div className="h-px bg-editorial-dark/5 mb-4" />

          {/* 상세 정보 */}
          <div className="flex items-center gap-6">
            {complex.total_units && (
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {complex.total_units.toLocaleString()}세대
                </span>
              </div>
            )}
            {complex.built_year && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {complex.built_year}년
                </span>
              </div>
            )}
            {complex.parking_ratio && (
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-editorial-ink/30" />
                <span className="text-sm text-editorial-ink/70">
                  {complex.parking_ratio.toFixed(1)}대
                </span>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="mt-6 pt-4 border-t border-editorial-dark/5">
            <span className="text-xs tracking-widest uppercase text-editorial-gold group-hover:text-editorial-dark transition-colors">
              참값 분석 보기
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
