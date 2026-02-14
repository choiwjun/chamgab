// @TASK Land Detail Page - Individual parcel view with transaction history
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { LandDetailClient } from '@/components/land/LandDetailClient'
import type { LandParcel, LandTransaction } from '@/types/land'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function fetchParcel(pnu: string): Promise<LandParcel | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_parcels')
    .select('*')
    .eq('pnu', pnu)
    .single()

  if (error || !data) return null
  return data as LandParcel
}

async function fetchTransactionsByParcel(
  parcel: LandParcel
): Promise<LandTransaction[]> {
  const supabase = getSupabase()

  // Match transactions by sigungu + eupmyeondong + jibun
  let query = supabase
    .from('land_transactions')
    .select('*')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(100)

  if (parcel.eupmyeondong) {
    query = query.eq('eupmyeondong', parcel.eupmyeondong)
  }
  if (parcel.jibun) {
    query = query.eq('jibun', parcel.jibun)
  }

  const { data, error } = await query

  if (error) {
    console.error('[LandDetail] Transactions error:', error.message)
    return []
  }

  return (data || []) as LandTransaction[]
}

async function fetchNearbyTransactions(
  parcel: LandParcel
): Promise<LandTransaction[]> {
  const supabase = getSupabase()

  // Fetch recent transactions in the same sigungu + eupmyeondong for comparison
  let query = supabase
    .from('land_transactions')
    .select('*')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(20)

  if (parcel.eupmyeondong) {
    query = query.eq('eupmyeondong', parcel.eupmyeondong)
  }
  // Exclude same jibun (those are the parcel's own transactions)
  if (parcel.jibun) {
    query = query.neq('jibun', parcel.jibun)
  }

  const { data, error } = await query

  if (error) {
    console.error('[LandDetail] Nearby transactions error:', error.message)
    return []
  }

  return (data || []) as LandTransaction[]
}

interface PageProps {
  params: Promise<{ pnu: string }>
}

export default async function LandDetailPage({ params }: PageProps) {
  const { pnu } = await params
  const decodedPnu = decodeURIComponent(pnu)

  const parcel = await fetchParcel(decodedPnu)

  if (!parcel) {
    notFound()
  }

  const [transactions, nearbyTransactions] = await Promise.all([
    fetchTransactionsByParcel(parcel),
    fetchNearbyTransactions(parcel),
  ])

  return (
    <main className="min-h-screen bg-[#F9FAFB]">
      <LandDetailClient
        parcel={parcel}
        transactions={transactions}
        nearbyTransactions={nearbyTransactions}
      />
    </main>
  )
}
