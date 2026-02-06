// @TASK P2-S1-T1 - 서비스 소개 섹션 (Editorial Luxury 스타일)
// @SPEC specs/screens/home.yaml#service_intro

'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

const features = [
  {
    number: '01',
    title: 'AI 아파트 가치 분석',
    description:
      '수천만 건의 실거래 데이터를 학습한 머신러닝 모델이 아파트의 정확한 적정가를 산출합니다.',
    detail: 'XGBoost & SHAP',
  },
  {
    number: '02',
    title: 'AI 상권 성공 예측',
    description:
      '전국 상권 데이터를 분석하여 업종별 창업 성공 확률과 핵심 성공 요인을 예측합니다.',
    detail: 'Business Intelligence',
  },
  {
    number: '03',
    title: '투명한 분석 근거',
    description:
      '왜 이 가격인지, 왜 이 상권인지 — 어떤 요소가 얼마나 영향을 미쳤는지 명확하게 보여드립니다.',
    detail: 'Explainable AI',
  },
  {
    number: '04',
    title: '실거래 기반 검증',
    description:
      '유사 매물의 실제 거래가와 비교하여 분석 결과의 신뢰성을 검증합니다.',
    detail: 'Real Data Driven',
  },
]

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0]
  index: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.7,
        delay: index * 0.15,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group relative"
    >
      {/* 번호 */}
      <div className="absolute -left-4 top-0 select-none font-display text-6xl leading-none text-editorial-sand/80 md:-left-8 md:text-7xl">
        {feature.number}
      </div>

      <div className="border-t border-editorial-dark/10 py-8 pl-12 md:pl-16">
        {/* 상단 라벨 */}
        <span className="text-xs uppercase tracking-[0.15em] text-editorial-gold">
          {feature.detail}
        </span>

        {/* 제목 */}
        <h3 className="mt-3 font-serif text-2xl leading-tight text-editorial-dark md:text-3xl">
          {feature.title}
        </h3>

        {/* 설명 */}
        <p className="mt-4 max-w-md leading-relaxed text-editorial-ink/60">
          {feature.description}
        </p>

        {/* 호버 시 화살표 */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          whileHover={{ opacity: 1, x: 0 }}
          className="mt-6 inline-flex cursor-pointer items-center gap-2 text-sm text-editorial-gold opacity-0 transition-opacity group-hover:opacity-100"
        >
          <span>자세히 보기</span>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </motion.div>
      </div>
    </motion.div>
  )
}

export function ServiceIntro() {
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-editorial-bg py-24 md:py-32"
    >
      {/* 배경 장식 */}
      <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-editorial-sand/30 to-transparent" />
      <div className="absolute bottom-0 left-0 h-1/2 w-px bg-gradient-to-t from-editorial-gold/20 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-6 md:px-8">
        {/* 섹션 헤더 - 비대칭 레이아웃 */}
        <div className="mb-16 grid gap-8 md:mb-24 md:grid-cols-12 md:gap-12">
          {/* 좌측: 섹션 라벨 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="md:col-span-3"
          >
            <span className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-editorial-ink/50">
              <span className="h-px w-8 bg-editorial-gold" />
              Why Chamgab
            </span>
          </motion.div>

          {/* 우측: 메인 타이틀 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="md:col-span-9"
          >
            <h2 className="font-serif text-4xl leading-[1.1] tracking-tight text-editorial-dark md:text-5xl lg:text-6xl">
              부동산 · 상권 분석의
              <br />
              <span className="italic text-editorial-gold">새로운 기준</span>
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-editorial-ink/60">
              참값은 데이터 과학의 힘으로 아파트 적정가와 창업 성공 확률을
              정확하고 투명하게 분석합니다.
            </p>
          </motion.div>
        </div>

        {/* 피처 리스트 */}
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-2" /> {/* 좌측 여백 */}
          <div className="space-y-4 md:col-span-10">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.number}
                feature={feature}
                index={index}
              />
            ))}
          </div>
        </div>

        {/* 하단 장식 텍스트 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 0.03 } : {}}
          transition={{ duration: 1, delay: 0.5 }}
          className="pointer-events-none absolute bottom-12 right-8 select-none font-display text-[8rem] leading-none text-editorial-dark md:text-[12rem]"
        >
          AI
        </motion.div>
      </div>
    </section>
  )
}
