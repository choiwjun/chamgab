export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function LandPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-64px)] w-full max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold text-[#191F28]">토지분석</h1>
      <p className="mt-3 text-[#4E5968]">
        토지 실거래 데이터 기반 분석 화면을 순차적으로 복구 중입니다.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/land/search"
          className="rounded-xl border border-[#E5E8EB] bg-white p-5 transition-colors hover:border-[#3182F6]"
        >
          <p className="text-base font-semibold text-[#191F28]">토지 검색</p>
          <p className="mt-1 text-sm text-[#4E5968]">
            지역/지번 기준으로 토지 정보를 확인합니다.
          </p>
        </Link>

        <Link
          href="/search"
          className="rounded-xl border border-[#E5E8EB] bg-white p-5 transition-colors hover:border-[#3182F6]"
        >
          <p className="text-base font-semibold text-[#191F28]">아파트 분석으로 이동</p>
          <p className="mt-1 text-sm text-[#4E5968]">
            참값 메인 분석 기능을 바로 이용할 수 있습니다.
          </p>
        </Link>
      </div>
    </main>
  )
}
