'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Building2, Store, ArrowRight } from 'lucide-react'

const services = [
  {
    id: 'apartment',
    icon: Building2,
    title: '아파트 적정가',
    description: 'AI가 분석한 아파트의 참값을 확인하세요',
    stats: '3,200만 건 실거래 데이터 기반',
    href: '/search',
    cta: '매물 검색하기',
    accentColor: 'editorial-gold',
    accentBg: 'bg-editorial-gold/10',
    accentText: 'text-editorial-gold',
    accentBorder: 'border-editorial-gold/20',
    hoverBorder: 'hover:border-editorial-gold/50',
  },
  {
    id: 'business',
    icon: Store,
    title: '상권분석',
    description: 'AI가 예측하는 창업 성공 확률을 확인하세요',
    stats: '전국 상권 데이터 + XGBoost 예측',
    href: '/business-analysis',
    cta: '상권 분석하기',
    accentColor: 'editorial-sage',
    accentBg: 'bg-editorial-sage/10',
    accentText: 'text-editorial-sage',
    accentBorder: 'border-editorial-sage/20',
    hoverBorder: 'hover:border-editorial-sage/50',
  },
]

export function ServiceSelector() {
  return (
    <section className="relative bg-editorial-bg py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        {/* 섹션 라벨 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <span className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-editorial-ink/50">
            <span className="h-px w-8 bg-editorial-dark/20" />
            Our Services
            <span className="h-px w-8 bg-editorial-dark/20" />
          </span>
          <h2 className="mt-4 font-serif text-3xl tracking-tight text-editorial-dark md:text-4xl">
            무엇을 분석할까요?
          </h2>
        </motion.div>

        {/* 서비스 카드 2열 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {services.map((service, index) => {
            const Icon = service.icon
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
              >
                <Link href={service.href as never}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.2 }}
                    className={`group relative border ${service.accentBorder} ${service.hoverBorder} cursor-pointer bg-white p-8 transition-all duration-300 md:p-10`}
                  >
                    {/* 아이콘 + 제목 */}
                    <div className="mb-6 flex items-start gap-4">
                      <div className={`${service.accentBg} rounded-none p-3`}>
                        <Icon
                          className={`h-6 w-6 ${service.accentText}`}
                          strokeWidth={1.5}
                        />
                      </div>
                      <div>
                        <h3 className="font-serif text-2xl tracking-tight text-editorial-dark md:text-3xl">
                          {service.title}
                        </h3>
                        <p className="mt-2 leading-relaxed text-editorial-ink/60">
                          {service.description}
                        </p>
                      </div>
                    </div>

                    {/* 통계 */}
                    <div className="mb-8 pl-[3.5rem]">
                      <span className="text-xs uppercase tracking-wide text-editorial-ink/40">
                        {service.stats}
                      </span>
                    </div>

                    {/* CTA */}
                    <div className="flex items-center justify-between pl-[3.5rem]">
                      <span
                        className={`text-sm font-medium tracking-wide ${service.accentText}`}
                      >
                        {service.cta}
                      </span>
                      <ArrowRight
                        className={`h-5 w-5 ${service.accentText} transform transition-transform group-hover:translate-x-1`}
                        strokeWidth={1.5}
                      />
                    </div>

                    {/* 하단 악센트 라인 */}
                    <div
                      className={`absolute bottom-0 left-0 h-0.5 w-0 ${service.id === 'apartment' ? 'bg-editorial-gold' : 'bg-editorial-sage'} transition-all duration-500 group-hover:w-full`}
                    />
                  </motion.div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
