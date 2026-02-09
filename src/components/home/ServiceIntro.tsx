'use client'

import { motion } from 'framer-motion'
import { BarChart3, Store, Eye, ShieldCheck } from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    iconColor: 'text-[#3182F6]',
    iconBg: 'bg-[#EBF5FF]',
    title: 'AI 아파트 가치 분석',
    description:
      '수천만 건의 실거래 데이터를 학습한 머신러닝 모델이 아파트의 정확한 적정가를 산출합니다.',
  },
  {
    icon: Store,
    iconColor: 'text-[#00C471]',
    iconBg: 'bg-[#E8FAF0]',
    title: 'AI 상권 성공 예측',
    description:
      '전국 상권 데이터를 분석하여 업종별 창업 성공 확률과 핵심 성공 요인을 예측합니다.',
  },
  {
    icon: Eye,
    iconColor: 'text-[#F59E0B]',
    iconBg: 'bg-[#FFF7ED]',
    title: '투명한 분석 근거',
    description:
      '왜 이 가격인지, 왜 이 상권인지 — 어떤 요소가 얼마나 영향을 미쳤는지 명확하게 보여드립니다.',
  },
  {
    icon: ShieldCheck,
    iconColor: 'text-[#8B5CF6]',
    iconBg: 'bg-[#F3F0FF]',
    title: '실거래 기반 검증',
    description:
      '유사 매물의 실제 거래가와 비교하여 분석 결과의 신뢰성을 검증합니다.',
  },
]

export function ServiceIntro() {
  return (
    <section className="bg-white py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold tracking-[-0.01em] text-[#191F28]">
            왜 참값인가요?
          </h2>
          <p className="mt-2 max-w-xl text-[#4E5968]">
            참값은 데이터 과학의 힘으로 아파트 적정가와 창업 성공 확률을
            정확하고 투명하게 분석합니다.
          </p>
        </motion.div>

        {/* 4-feature 그리드 */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, duration: 0.4 }}
              >
                <div className="rounded-2xl bg-[#F9FAFB] p-7 transition-all duration-200 hover:-translate-y-0.5">
                  {/* 아이콘 */}
                  <div
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.iconBg}`}
                  >
                    <Icon
                      className={`h-6 w-6 ${feature.iconColor}`}
                      strokeWidth={2}
                    />
                  </div>

                  {/* 제목 */}
                  <h3 className="mt-4 font-semibold text-[#191F28]">
                    {feature.title}
                  </h3>

                  {/* 설명 */}
                  <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
