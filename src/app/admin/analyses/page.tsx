import { AdminAnalysesClient } from './ui'

export default function AdminAnalysesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">참값 분석</h1>
        <p className="mt-2 text-sm text-[#6B7684]">분석 결과 모니터링</p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminAnalysesClient />
      </section>
    </div>
  )
}
