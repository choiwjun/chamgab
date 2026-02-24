export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function SchoolAnalysisPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-64px)] w-full max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold text-[#191F28]">학군분석</h1>
      <p className="mt-3 text-[#4E5968]">
        학군분석 리포트 페이지를 순차적으로 복구 중입니다. 우선 프리뷰 중심으로 접근할 수 있도록 재오픈했습니다.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/search"
          className="rounded-xl border border-[#E5E8EB] bg-white p-5 transition-colors hover:border-[#3182F6]"
        >
          <p className="text-base font-semibold text-[#191F28]">아파트 검색</p>
          <p className="mt-1 text-sm text-[#4E5968]">
            주소/단지 기준으로 매물을 탐색합니다.
          </p>
        </Link>

        <Link
          href="/business-analysis"
          className="rounded-xl border border-[#E5E8EB] bg-white p-5 transition-colors hover:border-[#3182F6]"
        >
          <p className="text-base font-semibold text-[#191F28]">상권분석</p>
          <p className="mt-1 text-sm text-[#4E5968]">
            지역/업종 기준으로 상권 분석을 이용합니다.
          </p>
        </Link>
      </div>
    </main>
  )
}
