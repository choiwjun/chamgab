// @TASK P2-S1-T1 - 서비스 소개 섹션 (Editorial Luxury 스타일)
// @SPEC specs/screens/home.yaml#service_intro

'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

const features = [
  {
    number: '01',
    title: 'AI 기반 가치 분석',
    description: '수천만 건의 실거래 데이터를 학습한 머신러닝 모델이 부동산의 정확한 가치를 산출합니다.',
    detail: 'XGBoost & SHAP',
  },
  {
    number: '02',
    title: '투명한 가격 형성 요인',
    description: '왜 이 가격인지, 어떤 요소가 얼마나 영향을 미쳤는지 명확하게 보여드립니다.',
    detail: 'Explainable AI',
  },
  {
    number: '03',
    title: '실거래 기반 검증',
    description: '유사 매물의 실제 거래가와 비교하여 분석 결과의 신뢰성을 검증합니다.',
    detail: 'Real Data Driven',
  },
]

function FeatureCard({
  feature,
  index
}: {
  feature: typeof features[0]
  index: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      {/* 번호 */}
      <div className="absolute -left-4 md:-left-8 top-0 font-display text-6xl md:text-7xl text-editorial-sand/80 leading-none select-none">
        {feature.number}
      </div>

      <div className="pl-12 md:pl-16 py-8 border-t border-editorial-dark/10">
        {/* 상단 라벨 */}
        <span className="text-xs tracking-[0.15em] uppercase text-editorial-gold">
          {feature.detail}
        </span>

        {/* 제목 */}
        <h3 className="mt-3 font-serif text-2xl md:text-3xl text-editorial-dark leading-tight">
          {feature.title}
        </h3>

        {/* 설명 */}
        <p className="mt-4 text-editorial-ink/60 leading-relaxed max-w-md">
          {feature.description}
        </p>

        {/* 호버 시 화살표 */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          whileHover={{ opacity: 1, x: 0 }}
          className="mt-6 inline-flex items-center gap-2 text-sm text-editorial-gold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <span>자세히 보기</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </motion.div>
      </div>
    </motion.div>
  )
}

export function ServiceIntro() {
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" })

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32 bg-editorial-bg overflow-hidden">
      {/* 배경 장식 */}
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-editorial-sand/30 to-transparent" />
      <div className="absolute bottom-0 left-0 w-px h-1/2 bg-gradient-to-t from-editorial-gold/20 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-6 md:px-8">
        {/* 섹션 헤더 - 비대칭 레이아웃 */}
        <div className="grid md:grid-cols-12 gap-8 md:gap-12 mb-16 md:mb-24">
          {/* 좌측: 섹션 라벨 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="md:col-span-3"
          >
            <span className="inline-flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-editorial-ink/50">
              <span className="w-8 h-px bg-editorial-gold" />
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
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-editorial-dark leading-[1.1] tracking-tight">
              부동산 가치 분석의
              <br />
              <span className="text-editorial-gold italic">새로운 기준</span>
            </h2>
            <p className="mt-6 text-lg text-editorial-ink/60 max-w-2xl leading-relaxed">
              참값은 데이터 과학과 부동산 전문성의 결합으로
              가장 정확하고 투명한 가치 분석을 제공합니다.
            </p>
          </motion.div>
        </div>

        {/* 피처 리스트 */}
        <div className="grid md:grid-cols-12 gap-8">
          <div className="md:col-span-2" /> {/* 좌측 여백 */}
          <div className="md:col-span-10 space-y-4">
            {features.map((feature, index) => (
              <FeatureCard key={feature.number} feature={feature} index={index} />
            ))}
          </div>
        </div>

        {/* 하단 장식 텍스트 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 0.03 } : {}}
          transition={{ duration: 1, delay: 0.5 }}
          className="absolute bottom-12 right-8 font-display text-[8rem] md:text-[12rem] text-editorial-dark leading-none pointer-events-none select-none"
        >
          AI
        </motion.div>
      </div>
    </section>
  )
}
