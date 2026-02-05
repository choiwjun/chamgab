// @TASK P2-S1-T2 - Hero 섹션 (Editorial Luxury 스타일)
// @SPEC specs/screens/home.yaml#hero_section

'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { SearchBar } from './SearchBar'

// 숫자 롤링 애니메이션 컴포넌트
function AnimatedNumber({
  value,
  suffix = '',
  duration = 2000
}: {
  value: number
  suffix?: string
  duration?: number
}) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return

    let startTime: number | null = null
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      // Easing function for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * value))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [value, duration, isInView])

  return (
    <span ref={ref} className="tabular-nums">
      {count.toLocaleString()}{suffix}
    </span>
  )
}

// 통계 아이템 컴포넌트
function StatItem({
  value,
  suffix,
  label,
  delay
}: {
  value: number
  suffix: string
  label: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="text-center"
    >
      <div className="font-display text-4xl md:text-5xl lg:text-6xl text-editorial-dark tracking-tight">
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      <div className="mt-2 text-sm tracking-wide text-editorial-ink/60 uppercase">
        {label}
      </div>
    </motion.div>
  )
}

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] bg-editorial-bg overflow-hidden">
      {/* 배경 텍스처 - 미묘한 노이즈 */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* 장식 라인 */}
      <div className="absolute top-0 left-1/4 w-px h-32 bg-gradient-to-b from-transparent via-editorial-gold/30 to-transparent" />
      <div className="absolute top-0 right-1/3 w-px h-48 bg-gradient-to-b from-transparent via-editorial-dark/10 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-6 md:px-8">
        {/* 상단 라벨 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="pt-20 md:pt-28"
        >
          <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
            <span className="w-8 h-px bg-editorial-gold" />
            AI-Powered Real Estate Analysis
          </span>
        </motion.div>

        {/* 메인 헤드라인 - 에디토리얼 타이포그래피 */}
        <div className="mt-8 md:mt-12">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="font-serif text-5xl md:text-7xl lg:text-8xl text-editorial-dark leading-[1.05] tracking-tight"
          >
            내 집의
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-baseline gap-4 md:gap-6"
          >
            <span className="font-display text-6xl md:text-8xl lg:text-9xl text-editorial-gold italic">
              참값
            </span>
            <span className="font-serif text-5xl md:text-7xl lg:text-8xl text-editorial-dark tracking-tight">
              을 찾다
            </span>
          </motion.div>
        </div>

        {/* 서브 카피 */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-8 md:mt-10 max-w-xl text-lg md:text-xl text-editorial-ink/70 leading-relaxed"
        >
          3,200만 건의 실거래 데이터와 AI가 만나
          <br className="hidden md:block" />
          가장 정확한 부동산 가치를 분석합니다.
        </motion.p>

        {/* 검색바 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-10 md:mt-14 max-w-2xl"
        >
          <SearchBar />
        </motion.div>

        {/* 구분선 */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 md:mt-24 h-px bg-editorial-dark/10 origin-left"
        />

        {/* 통계 섹션 */}
        <div className="py-12 md:py-16 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          <StatItem value={3200} suffix="만+" label="학습 데이터" delay={1.0} />
          <StatItem value={50} suffix="개+" label="분석 요인" delay={1.1} />
          <StatItem value={126} suffix="개" label="분석 지역" delay={1.2} />
          <StatItem value={17} suffix="개" label="시도 커버리지" delay={1.3} />
        </div>

        {/* 하단 장식 요소 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-3"
        >
          <span className="text-xs tracking-widest uppercase text-editorial-ink/40">
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="w-px h-8 bg-gradient-to-b from-editorial-gold to-transparent"
          />
        </motion.div>
      </div>

      {/* 우측 장식 - 대형 숫자 */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 0.03, x: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute top-1/4 -right-20 font-display text-[20rem] md:text-[30rem] text-editorial-dark leading-none pointer-events-none select-none"
      >
        94
      </motion.div>
    </section>
  )
}
