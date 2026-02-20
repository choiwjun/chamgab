import { AdminAdminsClient } from './ui'
import { getAdminContext } from '@/lib/auth/admin-context'
import { notFound } from 'next/navigation'

export default async function AdminAdminsPage() {
  const ctx = await getAdminContext()
  if (!ctx || ctx.role !== 'super_admin') notFound()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">관리자</h1>
        <p className="mt-2 text-sm text-[#6B7684]">
          관리자 계정 관리 (super_admin 전용)
        </p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminAdminsClient />
      </section>
    </div>
  )
}
