// @TASK P2-S1-T4 - 인기 매물 섹션
// @SPEC specs/screens/home.yaml#popular_properties

import { getPopularProperties } from '@/lib/api/properties'
import { PropertyCard } from '@/components/common/PropertyCard'

export async function PopularProperties() {
  const properties = await getPopularProperties(10)

  if (properties.length === 0) {
    return (
      <section className="bg-gray-50 py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 md:mb-8">
            인기 매물
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">
              인기 매물 데이터를 불러올 수 없습니다.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-gray-50 py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-end justify-between md:mb-8">
          <h2 className="text-2xl font-bold text-gray-900">인기 매물</h2>
          <a
            href="/search"
            className="text-sm font-medium text-primary hover:underline"
          >
            전체 보기
          </a>
        </div>

        {/* 가로 스크롤 리스트 */}
        <div className="scrollbar-hide -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:gap-6">
          {properties.map((property, index) => (
            <PropertyCard key={property.id} property={property} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
