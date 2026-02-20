import { AdminUsersClient } from '../users-client'

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">사용자</h1>
        <p className="mt-2 text-sm text-[#6B7684]">
          티어/일일 한도/사용량 운영 변경
        </p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminUsersClient />
      </section>
    </div>
  )
}
