export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-primary py-20 text-white">
        <div className="mx-auto max-w-7xl px-4">
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">
            AI가 분석한 부동산의 <span className="text-accent">참값</span>
          </h1>
          <p className="mb-8 text-lg text-white/80">
            머신러닝 기반 정확한 가격 분석으로 현명한 부동산 결정을 내리세요
          </p>
          {/* SearchBar component will be added here */}
          <div className="rounded-lg bg-white p-4 shadow-lg">
            <input
              type="text"
              placeholder="아파트, 지역명으로 검색"
              className="w-full border-none text-lg text-gray-900 outline-none"
            />
          </div>
        </div>
      </section>

      {/* Price Trends Section */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-8 text-2xl font-bold">지역별 가격 트렌드</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {/* TrendCard components will be added here */}
            <div className="rounded-lg border p-4 shadow-sm">
              <p className="text-gray-500">가격 트렌드 로딩 중...</p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Properties Section */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-8 text-2xl font-bold">인기 매물</h2>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {/* PropertyCard components will be added here */}
            <div className="min-w-[280px] rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-gray-500">인기 매물 로딩 중...</p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Intro Section */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold">
            참값이 특별한 이유
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mb-4 text-4xl">📊</div>
              <h3 className="mb-2 font-semibold">AI 기반 참값 분석</h3>
              <p className="text-gray-600">머신러닝으로 정확한 가격 예측</p>
            </div>
            <div className="text-center">
              <div className="mb-4 text-4xl">🔍</div>
              <h3 className="mb-2 font-semibold">가격 형성 요인</h3>
              <p className="text-gray-600">왜 이 가격인지 투명하게 공개</p>
            </div>
            <div className="text-center">
              <div className="mb-4 text-4xl">📈</div>
              <h3 className="mb-2 font-semibold">유사 거래 비교</h3>
              <p className="text-gray-600">실거래 데이터 기반 검증</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
