export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { LandHeroSection } from '@/components/land/LandHeroSection'
import { LandRecentTransactions } from '@/components/land/LandRecentTransactions'
import { buildSearchTerms, normalizeSearchQuery } from '@/lib/sanitize'
import type { LandTransaction } from '@/types/land'

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

async function fetchRecentTransactions(
  limit = 80,
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
      console.error(
        '[LandSearchPage] recent transactions error:',
        error.message
      )
      return []
    }

    return mapTransactionRows(
      data as Array<
        LandTransaction & { land_parcels?: { pnu?: string | null } | null }
      >
    )
  } catch (error) {
    console.error(
      '[LandSearchPage] recent transactions fetch exception:',
      error
    )
    return []
  }
}

async function fetchSearchTransactions(
  rawQuery: string,
  limit = 80
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
      .limit(300)

    if (error) {
      console.error(
        '[LandSearchPage] search transactions error:',
        error.message
      )
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

    if (filtered.length > 0) return filtered.slice(0, limit)
    return mapped.slice(0, limit)
  } catch (error) {
    console.error('[LandSearchPage] search transactions exception:', error)
    return []
  }
}

export default async function LandSearchPage({
  searchParams,
}: {
  searchParams?: { q?: string | string[]; sigungu?: string | string[] }
}) {
  const q = pickFirst(searchParams?.q)?.trim()
  const sigungu = pickFirst(searchParams?.sigungu)?.trim()
  const isQuerySearch = Boolean(q)

  const transactions = isQuerySearch
    ? await fetchSearchTransactions(q as string, 80)
    : await fetchRecentTransactions(80, sigungu)

  const title = isQuerySearch
    ? `"${q}" 검색 결과`
    : sigungu
      ? `${sigungu} 토지 거래 리스트`
      : '전체 토지 거래 리스트'

  const subtitle = isQuerySearch
    ? `총 ${transactions.length}건의 거래를 찾았습니다.`
    : sigungu
      ? `${sigungu}의 최근 거래 ${transactions.length}건입니다.`
      : `최근 토지 거래 ${transactions.length}건입니다.`

  const emptyMessage = isQuerySearch
    ? `"${q}" 조건에 맞는 거래를 찾지 못했습니다.`
    : sigungu
      ? `${sigungu} 조건에 맞는 거래 이력이 없습니다.`
      : '조건에 맞는 거래 이력이 없습니다.'

  return (
    <main className="min-h-screen">
      <LandHeroSection initialQuery={q || ''} />
      <LandRecentTransactions
        transactions={transactions}
        title={title}
        subtitle={subtitle}
        emptyMessage={emptyMessage}
      />
    </main>
  )
}
