import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminDashboardPage() {
  const admin = createAdminClient()

  const [
    usersCount,
    analysesTodayCount,
    premiumCount,
    businessCount,
    landRunsCount,
  ] = await Promise.all([
    admin.from('user_profiles').select('*', { count: 'exact', head: true }),
    admin
      .from('chamgab_analyses')
      .select('*', { count: 'exact', head: true })
      .gte(
        'analyzed_at',
        new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      ),
    admin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tier', 'premium'),
    admin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tier', 'business'),
    admin
      .from('land_collection_runs')
      .select('*', { count: 'exact', head: true }),
  ])

  const cards = [
    { label: '총 사용자', value: usersCount.count ?? 0 },
    { label: '오늘 참값 분석', value: analysesTodayCount.count ?? 0 },
    { label: 'Premium', value: premiumCount.count ?? 0 },
    { label: 'Business', value: businessCount.count ?? 0 },
    { label: '토지 수집 런', value: landRunsCount.count ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[#191F28]">대시보드</h1>
        <p className="mt-2 text-sm text-[#6B7684]">정식 운영 관리자 콘솔</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-[#E5E8EB] bg-white p-5"
          >
            <div className="text-xs font-semibold text-[#6B7684]">
              {c.label}
            </div>
            <div className="mt-2 text-3xl font-bold text-[#191F28]">
              {Number(c.value).toLocaleString('ko-KR')}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#E5E8EB] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#191F28]">운영 체크</h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-[#4E5968]">
          <li>구독/결제 RLS가 service_role 전용인지 확인</li>
          <li>스케줄러/학습 잡 엔드포인트는 외부 노출 시 토큰 보호 필요</li>
          <li>요금제 한도(Free/Premium/Business) 문구와 DB 한도 일치 필요</li>
        </ul>
      </section>
    </div>
  )
}
