import { AdminLandRunsClient } from './ui'

export default function AdminLandRunsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">토지 수집</h1>
        <p className="mt-2 text-sm text-[#6B7684]">월별 수집 런 모니터링</p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminLandRunsClient />
      </section>
    </div>
  )
}
