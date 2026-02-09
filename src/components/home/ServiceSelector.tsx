'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Building2, Store, ArrowRight } from 'lucide-react'

const services = [
  {
    id: 'apartment',
    icon: Building2,
    iconColor: 'text-[#3182F6]',
    iconBg: 'bg-[#EBF5FF]',
    title: '아파트 적정가',
    description:
      'AI가 분석한 아파트의 참값을 확인하세요. 실거래 데이터 기반으로 정확한 적정가를 산출합니다.',
    href: '/search',
    cta: '매물 검색하기',
    ctaColor: 'text-[#3182F6]',
  },
  {
    id: 'business',
    icon: Store,
    iconColor: 'text-[#00C471]',
    iconBg: 'bg-[#E8FAF0]',
    title: '상권분석',
    description:
      'AI가 예측하는 창업 성공 확률을 확인하세요. 전국 상권 데이터를 분석하여 핵심 인사이트를 제공합니다.',
    href: '/business-analysis',
    cta: '상권 분석하기',
    ctaColor: 'text-[#00C471]',
  },
]

export function ServiceSelector() {
  return (
    <section className="bg-[#F9FAFB] py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
            무엇을 분석할까요?
          </h2>
          <p className="mt-2 text-[#4E5968]">
            AI 기반 분석 서비스를 선택하세요
          </p>
        </motion.div>

        {/* 서비스 카드 - 2컬럼 그리드 */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {services.map((service, index) => {
            const Icon = service.icon
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Link href={service.href as never}>
                  <div className="group h-full rounded-2xl border border-[#E5E8EB] bg-white p-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3182F6]/20">
                    {/* 아이콘 */}
                    <div
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${service.iconBg}`}
                    >
                      <Icon
                        className={`h-6 w-6 ${service.iconColor}`}
                        strokeWidth={2}
                      />
                    </div>

                    {/* 제목 */}
                    <h3 className="mt-4 text-lg font-semibold text-[#191F28]">
                      {service.title}
                    </h3>

                    {/* 설명 */}
                    <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
                      {service.description}
                    </p>

                    {/* CTA */}
                    <div
                      className={`mt-5 inline-flex items-center gap-1 text-sm font-medium ${service.ctaColor} opacity-60 transition-all group-hover:gap-2 group-hover:opacity-100`}
                    >
                      {service.cta}
                      <ArrowRight className="h-4 w-4" strokeWidth={2} />
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
