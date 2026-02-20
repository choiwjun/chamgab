import { AdminAuditClient } from './ui'

export default function AdminAuditPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">감사 로그</h1>
        <p className="mt-2 text-sm text-[#6B7684]">관리자 작업 추적</p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminAuditClient />
      </section>
    </div>
  )
}
