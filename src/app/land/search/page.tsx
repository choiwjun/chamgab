export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function LandSearchPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-64px)] w-full max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold text-[#191F28]">토지 검색</h1>
      <p className="mt-3 text-[#4E5968]">
        검색 UI를 재연결 중입니다. 현재는 메인 토지 페이지에서 핵심 안내를 확인할 수 있습니다.
      </p>

      <div className="mt-8">
        <Link
          href="/land"
          className="inline-flex rounded-lg bg-[#3182F6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B64DA]"
        >
          토지분석 홈으로
        </Link>
      </div>
    </main>
  )
}
