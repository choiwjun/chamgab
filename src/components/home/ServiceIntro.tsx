// @TASK P2-S1-T1 - 서비스 소개 섹션
// @SPEC specs/screens/home.yaml#service_intro

import { BarChart3, Search, TrendingUp } from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    title: 'AI 기반 참값 분석',
    description: '머신러닝으로 정확한 가격 예측',
  },
  {
    icon: Search,
    title: '가격 형성 요인',
    description: '왜 이 가격인지 투명하게 공개',
  },
  {
    icon: TrendingUp,
    title: '유사 거래 비교',
    description: '실거래 데이터 기반 검증',
  },
]

export function ServiceIntro() {
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-900 md:mb-12">
          참값이 특별한 이유
        </h2>

        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group text-center transition-transform hover:-translate-y-1"
              >
                <div className="mb-4 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <Icon className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
