import { AdminJobsClient } from './ui'

export default function AdminJobsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">수집/학습 잡</h1>
        <p className="mt-2 text-sm text-[#6B7684]">
          ML API 스케줄러 상태 확인 및 즉시 실행
        </p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminJobsClient />
      </section>
    </div>
  )
}
