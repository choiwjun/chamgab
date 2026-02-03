// @TASK P2-S1-T3 - 가격 트렌드 섹션
// @SPEC specs/screens/home.yaml#price_trends

import { getRegionTrends } from '@/lib/api/regions'
import { TrendCard } from './TrendCard'

export async function PriceTrends() {
  const trends = await getRegionTrends(6)

  if (trends.length === 0) {
    return (
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 md:mb-8">
            지역별 가격 트렌드
          </h2>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-gray-500">
              가격 트렌드 데이터를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-end justify-between md:mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            지역별 가격 트렌드
          </h2>
          <a
            href="/trends"
            className="text-sm font-medium text-primary hover:underline"
          >
            전체 보기
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {trends.map((trend) => (
            <TrendCard key={trend.id} trend={trend} />
          ))}
        </div>
      </div>
    </section>
  )
}
