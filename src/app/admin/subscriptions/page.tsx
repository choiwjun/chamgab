import { AdminSubscriptionsClient } from './ui'

export default function AdminSubscriptionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">구독/결제</h1>
        <p className="mt-2 text-sm text-[#6B7684]">
          결제 연동 전이라도 운영 조회는 가능
        </p>
      </header>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <AdminSubscriptionsClient />
      </section>
    </div>
  )
}
