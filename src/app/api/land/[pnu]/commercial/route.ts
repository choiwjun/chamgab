export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { LandParcel, LandTransaction } from '@/types/land'
import { buildLandCommercialAnalysis } from '@/lib/land/commercial-analysis'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

async function fetchParcelByPnu(pnu: string): Promise<LandParcel | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_parcels')
    .select('*')
    .eq('pnu', pnu)
    .single()

  if (error || !data) return null
  return data as LandParcel
}

async function fetchTransactionById(
  transactionId: string
): Promise<LandTransaction | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('is_cancelled', false)
    .single()

  if (error || !data) return null
  return data as LandTransaction
}

function buildSyntheticParcelFromTransaction(tx: LandTransaction): LandParcel {
  const nowIso = new Date().toISOString()
  return {
    id: `tx-${tx.id}`,
    pnu: tx.parcel_id || `tx-${tx.id}`,
    sido: tx.sido,
    sigungu: tx.sigungu,
    eupmyeondong: tx.eupmyeondong || null,
    jibun: tx.jibun || null,
    land_category: tx.land_category || 'unknown',
    zoning: tx.zoning || null,
    area_m2: tx.area_m2 || null,
    location: null,
    latest_official_price_per_m2: null,
    latest_official_price_year: null,
    latest_transaction_price: tx.price || null,
    latest_transaction_date: tx.transaction_date || null,
    latest_price_per_m2: tx.price_per_m2 || null,
    created_at: tx.created_at || nowIso,
    updated_at: nowIso,
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pnu: string }> }
) {
  try {
    const { pnu } = await context.params
    const decodedPnu = decodeURIComponent(pnu)

    let parcel = await fetchParcelByPnu(decodedPnu)
    if (!parcel && decodedPnu.startsWith('tx-')) {
      const tx = await fetchTransactionById(decodedPnu.slice(3))
      if (tx) parcel = buildSyntheticParcelFromTransaction(tx)
    }

    if (!parcel) {
      return NextResponse.json({ detail: 'Parcel not found' }, { status: 404 })
    }

    const analysis = await buildLandCommercialAnalysis({ parcel })
    return NextResponse.json({
      pnu: decodedPnu,
      parcel: {
        pnu: parcel.pnu,
        sido: parcel.sido,
        sigungu: parcel.sigungu,
        eupmyeondong: parcel.eupmyeondong,
        jibun: parcel.jibun,
        land_category: parcel.land_category,
        zoning: parcel.zoning,
        area_m2: parcel.area_m2,
      },
      ...analysis,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to build analysis'
    return NextResponse.json({ detail: message }, { status: 500 })
  }
}

