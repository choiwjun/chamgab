'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Building2, Store, MapPin, GraduationCap, ArrowRight } from 'lucide-react'

const SERVICES_ALL = [
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
      'AI가 예측하는 창업 성공 확률을 확인하세요. 입력/탐색은 자유롭게, 상세 결과는 로그인 후 제공합니다.',
    href: '/business-analysis',
    cta: '상권 분석하기',
    ctaColor: 'text-[#00C471]',
  },
  {
    id: 'school',
    icon: GraduationCap,
    iconColor: 'text-[#0EA5E9]',
    iconBg: 'bg-[#E8F6FD]',
    title: '학군분석',
    description:
      '학교 수준, 진학 경로, 학원 생태계를 미리 비교하세요. 상세 리포트는 로그인 후 확인할 수 있습니다.',
    href: '/school-analysis',
    cta: '학군 분석하기',
    ctaColor: 'text-[#0EA5E9]',
  },
  {
    id: 'land',
    icon: MapPin,
    iconColor: 'text-[#F59E0B]',
    iconBg: 'bg-[#FFF7ED]',
    title: '토지분석',
    description:
      '토지 실거래 데이터와 AI 분석으로 최적의 투자 기회를 찾으세요. 지역별 토지 시세와 최근 거래를 확인하세요.',
    href: '/land',
    cta: '토지 분석하기',
    ctaColor: 'text-[#F59E0B]',
  },
] as const

export function ServiceSelector() {
  const services = SERVICES_ALL

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
            탐색은 자유롭게, 핵심 분석 결과는 로그인 후 제공됩니다
          </p>
        </motion.div>

        {/* 서비스 카드 - 3컬럼 그리드 */}
        <div
          className={`mt-10 grid gap-4 md:grid-cols-2 ${services.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
        >
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
