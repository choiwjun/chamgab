// @TASK P2-S1-T2 - Hero 섹션
// @SPEC specs/screens/home.yaml#hero_section

import { SearchBar } from './SearchBar'
import { getPopularSearches } from '@/lib/api/search'

export async function HeroSection() {
  // 인기 검색어 API 호출 (상위 6개)
  const popularSearches = await getPopularSearches(6)

  return (
    <section className="bg-primary py-16 text-white md:py-24">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 text-center">
          <h1 className="mb-4 text-3xl font-bold leading-tight md:text-5xl">
            AI가 분석한 부동산의 <span className="text-accent">참값</span>
          </h1>
          <p className="text-base text-white/90 md:text-lg">
            머신러닝 기반 정확한 가격 분석으로 현명한 부동산 결정을 내리세요
          </p>
        </div>

        <div className="flex justify-center">
          <SearchBar />
        </div>

        {/* 빠른 검색 키워드 - 실제 데이터 연동 */}
        {popularSearches.items.length > 0 && (
          <div className="mt-6 text-center">
            <p className="mb-2 text-sm text-white/70">인기 검색어</p>
            <div className="flex flex-wrap justify-center gap-2">
              {popularSearches.items.map((item) => (
                <a
                  key={item.keyword}
                  href={`/search?q=${encodeURIComponent(item.keyword)}`}
                  className="rounded-full border border-white/30 px-3 py-1 text-sm text-white transition-colors hover:border-white/60 hover:bg-white/10"
                >
                  #{item.keyword}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
