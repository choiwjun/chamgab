import { AdminSearchStatsClient } from './ui'

export default function AdminSearchStatsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">검색 통계</h1>
        <p className="mt-2 text-sm text-[#6B7684]">추천/검색 클릭 카운터</p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminSearchStatsClient />
      </section>
    </div>
  )
}
