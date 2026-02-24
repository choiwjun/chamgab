import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAdminGate } from '@/lib/auth/admin-context'

export const metadata: Metadata = {
  title: '관리자 | 참값',
  description: '참값 운영 관리',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const gate = await getAdminGate()
  if (!gate.context) {
    if (gate.reason === 'unauthenticated') {
      redirect('/auth/login?redirect=/admin')
    }

    return (
      <main className="min-h-screen bg-[#F9FAFB]">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <section className="rounded-2xl border border-[#E5E8EB] bg-white p-6">
            <h1 className="text-2xl font-bold text-[#191F28]">
              관리자 권한이 필요합니다
            </h1>
            <p className="mt-3 text-sm text-[#4E5968]">
              현재 계정은 관리자 콘솔 접근 권한이 없습니다. `admin_users` 테이블에
              계정을 등록하거나, 초기 부트스트랩 환경(`ADMIN_BOOTSTRAP=true` +
              `ADMIN_EMAILS`)을 확인해주세요.
            </p>
            <div className="mt-5">
              <Link
                href={'/' as never}
                className="inline-flex rounded-xl border border-[#E5E8EB] px-4 py-2 text-sm font-medium text-[#191F28] hover:bg-[#F2F4F6]"
              >
                홈으로 이동
              </Link>
            </div>
          </section>
        </div>
      </main>
    )
  }
  const ctx = gate.context

  const nav = [
    { href: '/admin', label: '대시보드' },
    { href: '/admin/users', label: '사용자' },
    { href: '/admin/analyses', label: '참값 분석' },
    { href: '/admin/subscriptions', label: '구독/결제' },
    { href: '/admin/land-runs', label: '토지 수집' },
    { href: '/admin/search-stats', label: '검색 통계' },
    { href: '/admin/jobs', label: '수집/학습 잡' },
    { href: '/admin/audit', label: '감사 로그' },
    { href: '/admin/admins', label: '관리자' },
  ]

  return (
    <main className="min-h-screen bg-[#F9FAFB]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-10 md:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-2xl border border-[#E5E8EB] bg-white p-5">
          <div className="mb-4">
            <div className="text-xs font-semibold text-[#6B7684]">
              Chamgab Admin
            </div>
            <div className="mt-1 text-sm font-semibold text-[#191F28]">
              {ctx.email}
            </div>
            <div className="mt-1 text-xs text-[#8B95A1]">
              role: {ctx.role}
              {ctx.bootstrap ? ' (bootstrap)' : ''}
            </div>
          </div>

          <nav className="space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as never}
                className="block rounded-xl px-3 py-2 text-sm font-medium text-[#191F28] hover:bg-[#F2F4F6]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {ctx.bootstrap && (
            <div className="mt-5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">
              현재는 `ADMIN_BOOTSTRAP=true` + `ADMIN_EMAILS`로 부트스트랩 접근
              중입니다. 정식 운영을 위해 `admin_users`에 계정을 등록한 뒤
              부트스트랩을 끄는 것을 권장합니다.
            </div>
          )}
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </main>
  )
}
