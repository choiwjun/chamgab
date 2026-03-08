export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { LandHeroSection } from '@/components/land/LandHeroSection'
import { LandRegionTrends } from '@/components/land/LandRegionTrends'
import { LandRecentTransactions } from '@/components/land/LandRecentTransactions'
import { ENABLE_LAND } from '@/lib/features'
import { buildSearchTerms, normalizeSearchQuery } from '@/lib/sanitize'
import type { LandRegionStats, LandTransaction } from '@/types/land'

const TRANSACTION_SELECT_COLUMNS = `
  id,
  parcel_id,
  sido,
  sigungu,
  eupmyeondong,
  jibun,
  land_category,
  area_m2,
  price,
  price_per_m2,
  transaction_date,
  transaction_type,
  is_partial_sale,
  is_cancelled,
  created_at,
  land_parcels(pnu)
`

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function mapTransactionRows(
  rows: Array<
    LandTransaction & { land_parcels?: { pnu?: string | null } | null }
  > | null
): LandTransaction[] {
  const source = rows || []
  return source.map((row) => ({
    ...row,
    pnu: row.land_parcels?.pnu ?? null,
  }))
}

function transactionSearchText(tx: LandTransaction): string {
  return `${tx.sido || ''}${tx.sigungu || ''}${tx.eupmyeondong || ''}${tx.jibun || ''}${tx.pnu || ''}`
    .replace(/\s+/g, '')
    .toLowerCase()
}

async function fetchRegionalStats(limit = 6): Promise<LandRegionStats[]> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase.rpc('get_land_regional_stats', {
      limit_count: limit,
    })

    if (error) {
      console.error('[LandPage] regional stats error:', error.message)
      return []
    }

    const stats = (data || []) as LandRegionStats[]
    if (stats.length === 0) return []

    const sigungus = Array.from(
      new Set(stats.map((stat) => stat.sigungu).filter(Boolean))
    )
    if (sigungus.length === 0) return stats

    const representativeBySigungu = new Map<string, string>()

    await Promise.all(
      sigungus.map(async (sigungu) => {
        const { data: parcelRows, error: parcelError } = await supabase
          .from('land_parcels')
          .select('pnu')
          .eq('sigungu', sigungu)
          .not('pnu', 'is', null)
          .order('latest_transaction_date', {
            ascending: false,
            nullsFirst: false,
          })
          .limit(1)

        if (parcelError) {
          console.error(
            '[LandPage] representative pnu lookup error:',
            sigungu,
            parcelError.message
          )
          return
        }

        const pnu = parcelRows?.[0]?.pnu
        if (typeof pnu === 'string' && pnu.length > 0) {
          representativeBySigungu.set(sigungu, pnu)
        }
      })
    )

    return stats.map((stat) => ({
      ...stat,
      sample_pnu: representativeBySigungu.get(stat.sigungu) || null,
    }))
  } catch (error) {
    console.error('[LandPage] regional stats fetch exception:', error)
    return []
  }
}

async function fetchRecentTransactions(
  limit = 10,
  sigungu?: string
): Promise<LandTransaction[]> {
  try {
    const supabase = getSupabase()

    let query = supabase
      .from('land_transactions')
      .select(TRANSACTION_SELECT_COLUMNS)
      .eq('is_cancelled', false)
      .order('transaction_date', { ascending: false })
      .limit(limit)

    if (sigungu) query = query.eq('sigungu', sigungu)

    const { data, error } = await query
    if (error) {
      console.error('[LandPage] recent transactions error:', error.message)
      return []
    }

    return mapTransactionRows(
      data as Array<
        LandTransaction & { land_parcels?: { pnu?: string | null } | null }
      >
    )
  } catch (error) {
    console.error('[LandPage] recent transactions fetch exception:', error)
    return []
  }
}

async function fetchSearchTransactions(
  rawQuery: string,
  limit = 40
): Promise<LandTransaction[]> {
  const normalized = normalizeSearchQuery(rawQuery)
  if (!normalized) return []

  const terms = buildSearchTerms(normalized, 5)
  const seedTerm = terms.find((term) => !term.includes(' ')) || terms[0]
  if (!seedTerm) return []

  try {
    const supabase = getSupabase()
    const filter = `jibun.ilike.%${seedTerm}%,eupmyeondong.ilike.%${seedTerm}%,sigungu.ilike.%${seedTerm}%,sido.ilike.%${seedTerm}%`

    const { data, error } = await supabase
      .from('land_transactions')
      .select(TRANSACTION_SELECT_COLUMNS)
      .eq('is_cancelled', false)
      .or(filter)
      .order('transaction_date', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[LandPage] search transactions error:', error.message)
      return []
    }

    const mapped = mapTransactionRows(
      data as Array<
        LandTransaction & { land_parcels?: { pnu?: string | null } | null }
      >
    )
    if (terms.length <= 1) {
      return mapped.slice(0, limit)
    }

    const normalizedTerms = terms.map((term) =>
      term.replace(/\s+/g, '').toLowerCase()
    )

    const filtered = mapped.filter((tx) => {
      const haystack = transactionSearchText(tx)
      return normalizedTerms.every((term) => haystack.includes(term))
    })

    if (filtered.length > 0) {
      return filtered.slice(0, limit)
    }

    return mapped.slice(0, limit)
  } catch (error) {
    console.error('[LandPage] search transactions exception:', error)
    return []
  }
}

export default async function LandPage({
  searchParams,
}: {
  searchParams?: { sigungu?: string | string[]; q?: string | string[] }
}) {
  if (!ENABLE_LAND) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-[#F8FAFC]">
        <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-20 text-center">
          <div className="mx-auto inline-flex rounded-full border border-[#D1D9E0] bg-white px-4 py-1 text-sm font-semibold text-[#4E5968]">
            토지분석 준비중
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#191F28]">
              토지분석은 내부 점검 모드로 전환됐습니다.
            </h1>
            <p className="text-base leading-7 text-[#4E5968]">
              공시지가와 토지특성 수집 소스를 재정비하는 동안 공개 제공을 잠시
              중단합니다. 현재는 아파트, 상권, 학군 분석만 운영 대상으로
              유지합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5E8EB] bg-white p-6 text-left">
            <div className="text-sm font-semibold text-[#191F28]">
              현재 상태
            </div>
            <ul className="mt-3 space-y-2 text-sm text-[#4E5968]">
              <li>토지 공개 페이지: 준비중</li>
              <li>내부 수집/검증: 최소 유지 모드</li>
              <li>재오픈 기준: 데이터 소스 안정화 후 재검토</li>
            </ul>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/"
              className="rounded-xl bg-[#191F28] px-5 py-3 text-sm font-semibold text-white"
            >
              홈으로 이동
            </Link>
            <Link
              href="/search"
              className="rounded-xl border border-[#D1D9E0] bg-white px-5 py-3 text-sm font-semibold text-[#191F28]"
            >
              아파트 분석 보기
            </Link>
          </div>
        </section>
      </main>
    )
  }

  const sigungu = pickFirst(searchParams?.sigungu)?.trim()
  const q = pickFirst(searchParams?.q)?.trim()
  const isSearchMode = Boolean(q)

  const [regionalStats, transactions] = await Promise.all([
    isSearchMode
      ? Promise.resolve([] as LandRegionStats[])
      : fetchRegionalStats(6),
    isSearchMode
      ? fetchSearchTransactions(q as string, 40)
      : fetchRecentTransactions(10, sigungu),
  ])

  return (
    <main className="min-h-screen">
      <LandHeroSection initialQuery={q || ''} />

      {isSearchMode ? (
        <LandRecentTransactions
          transactions={transactions}
          title={`"${q}" 검색 결과`}
          subtitle={`총 ${transactions.length}건의 거래를 찾았습니다.`}
          emptyMessage={`"${q}" 조건에 맞는 거래를 찾지 못했습니다.`}
        />
      ) : (
        <>
          <LandRegionTrends stats={regionalStats} />
          <LandRecentTransactions transactions={transactions} />
        </>
      )}
    </main>
  )
}
