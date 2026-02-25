export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/app/api/_auth'
import { createClient } from '@/lib/supabase/server'
import {
  CreditConsumeError,
  consumeCredits,
  insufficientCreditsPayload,
} from '@/lib/credits/consume'
import { getCreditCost } from '@/lib/credits/cost'
import { ENABLE_FREE_OPEN_MODE } from '@/lib/features'
import type { LandParcel, LandTransaction } from '@/types/land'
import { buildLandAnalysisSummary } from '@/lib/land/analysis'

const LAND_QUALITY_VERSION =
  process.env.LAND_QUALITY_VERSION || 'land-quality-v1'

type QualityGateStatus = 'pass' | 'warn' | 'fail'
type QualityGrade = 'A' | 'B' | 'C' | 'D'

function getSupabase() {
  return createSupabaseClient(
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
    zoning: null,
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

function hydrateParcelWithLatestTransaction(
  parcel: LandParcel,
  transactions: LandTransaction[]
): LandParcel {
  if (!transactions.length) {
    return parcel
  }

  const latest = [...transactions].sort((a, b) =>
    a.transaction_date < b.transaction_date ? 1 : -1
  )[0]

  return {
    ...parcel,
    land_category:
      parcel.land_category === 'unknown' && latest.land_category
        ? latest.land_category
        : parcel.land_category,
    area_m2: parcel.area_m2 ?? latest.area_m2 ?? null,
    latest_transaction_price: parcel.latest_transaction_price ?? latest.price,
    latest_transaction_date:
      parcel.latest_transaction_date ?? latest.transaction_date,
    latest_price_per_m2: parcel.latest_price_per_m2 ?? latest.price_per_m2,
  }
}

async function fetchTransactionsByParcel(
  parcel: LandParcel
): Promise<LandTransaction[]> {
  const supabase = getSupabase()
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
  if (error || !data) return []
  return data as LandTransaction[]
}

async function fetchNearbyTransactions(
  parcel: LandParcel,
  excludeTransactionId?: string
): Promise<LandTransaction[]> {
  const supabase = getSupabase()
  const nearbyParcels = await fetchNearbyParcelsWithinRadius(parcel, 500, 200)
  const nearbyParcelIds = nearbyParcels.map((row) => row.id).filter(Boolean)

  if (nearbyParcelIds.length > 0) {
    let query = supabase
      .from('land_transactions')
      .select('*')
      .eq('is_cancelled', false)
      .in('parcel_id', nearbyParcelIds)
      .order('transaction_date', { ascending: false })
      .limit(80)

    if (excludeTransactionId) {
      query = query.neq('id', excludeTransactionId)
    }

    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return data as LandTransaction[]
    }
  }

  // Coordinate-less parcel fallback (legacy rows, synthetic tx-* rows)
  let fallbackQuery = supabase
    .from('land_transactions')
    .select('*')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(50)

  if (parcel.eupmyeondong) {
    fallbackQuery = fallbackQuery.eq('eupmyeondong', parcel.eupmyeondong)
  }
  if (parcel.jibun) {
    fallbackQuery = fallbackQuery.neq('jibun', parcel.jibun)
  }
  if (excludeTransactionId) {
    fallbackQuery = fallbackQuery.neq('id', excludeTransactionId)
  }

  const { data, error } = await fallbackQuery
  if (error || !data) return []
  return data as LandTransaction[]
}

function parsePointFromGeometry(
  location: LandParcel['location'] | string | null
): { lat: number; lng: number } | null {
  if (!location) return null

  if (typeof location === 'string') {
    const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i)
    if (!match) return null
    const lng = Number(match[1])
    const lat = Number(match[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  if (
    location.type === 'Point' &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length >= 2
  ) {
    const [lng, lat] = location.coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  return null
}

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371000 * c
}

async function fetchNearbyParcelsWithinRadius(
  parcel: LandParcel,
  radiusMeters: number,
  limit: number
): Promise<
  Array<{
    id: string
    pnu: string
    eupmyeondong: string | null
    jibun: string | null
    location: LandParcel['location']
  }>
> {
  const supabase = getSupabase()
  const subjectPoint = parsePointFromGeometry(parcel.location)
  if (!subjectPoint) return []

  const { data, error } = await supabase
    .from('land_parcels')
    .select('id,pnu,eupmyeondong,jibun,location')
    .eq('sigungu', parcel.sigungu)
    .neq('id', parcel.id)
    .not('location', 'is', null)
    .limit(600)

  if (error || !data) return []

  const nearby = (data as Array<Record<string, unknown>>)
    .map((row) => {
      const point = parsePointFromGeometry(
        (row.location as LandParcel['location']) || null
      )
      if (!point) return null

      const distanceMeters = haversineDistanceMeters(
        subjectPoint.lat,
        subjectPoint.lng,
        point.lat,
        point.lng
      )
      if (distanceMeters > radiusMeters) return null

      return {
        id: String(row.id || ''),
        pnu: String(row.pnu || ''),
        eupmyeondong: row.eupmyeondong ? String(row.eupmyeondong) : null,
        jibun: row.jibun ? String(row.jibun) : null,
        location: (row.location as LandParcel['location']) || null,
        distanceMeters,
      }
    })
    .filter(
      (
        row
      ): row is {
        id: string
        pnu: string
        eupmyeondong: string | null
        jibun: string | null
        location: LandParcel['location']
        distanceMeters: number
      } => Boolean(row)
    )
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit)

  return nearby
}

function monthsSince(dateValue: string | null | undefined): number | null {
  if (!dateValue) return null
  const parsed = Date.parse(dateValue)
  if (!Number.isFinite(parsed)) return null
  const now = new Date()
  const date = new Date(parsed)
  return (
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth())
  )
}

function deriveLandQualityMeta(args: {
  parcel: LandParcel
  snapshot: {
    sample_size: number
    parcel_transaction_count: number
    nearby_transaction_count: number
  }
  confidenceHint: number | null
}): {
  quality_gate_status: QualityGateStatus
  quality_grade: QualityGrade
  quality_flags: string[]
  quality_version: string
  data_freshness: string | null
} {
  const flags: string[] = []
  if (!args.parcel.location) flags.push('missing_parcel_location')
  if (args.parcel.latest_official_price_per_m2 == null) {
    flags.push('missing_official_price')
  }
  if (args.snapshot.nearby_transaction_count < 5) {
    flags.push('low_nearby_samples')
  }
  if (args.snapshot.sample_size < 10) {
    flags.push('low_total_samples')
  }
  const staleMonths = monthsSince(args.parcel.latest_transaction_date)
  if (staleMonths != null && staleMonths > 12) {
    flags.push('stale_transaction_data')
  }

  const hasFail =
    args.snapshot.sample_size < 5 ||
    (args.snapshot.parcel_transaction_count === 0 &&
      args.snapshot.nearby_transaction_count < 5)

  const quality_gate_status: QualityGateStatus = hasFail
    ? 'fail'
    : flags.length > 0
      ? 'warn'
      : 'pass'

  const quality_grade: QualityGrade =
    quality_gate_status === 'fail'
      ? 'D'
      : quality_gate_status === 'warn'
        ? 'C'
        : (args.confidenceHint ?? 0) >= 75
          ? 'A'
          : 'B'

  return {
    quality_gate_status,
    quality_grade,
    quality_flags: flags,
    quality_version: LAND_QUALITY_VERSION,
    data_freshness: args.parcel.latest_transaction_date,
  }
}

export async function GET(request: NextRequest) {
  try {
    const pnu = request.nextUrl.searchParams.get('pnu')?.trim()
    if (!pnu) {
      return NextResponse.json(
        { error: 'pnu query param is required' },
        { status: 400 }
      )
    }

    if (!ENABLE_FREE_OPEN_MODE) {
      const auth = await requireApiUser()
      if ('response' in auth) return auth.response

      const userSupabase = await createClient()
      try {
        await consumeCredits({
          supabase: userSupabase,
          product: 'land',
          cost: getCreditCost('land'),
          meta: { user_id: auth.userId, pnu },
        })
      } catch (error) {
        if (
          error instanceof CreditConsumeError &&
          error.code === 'insufficient_credits'
        ) {
          return NextResponse.json(insufficientCreditsPayload(error.quota), {
            status: error.status,
          })
        }
        return NextResponse.json(
          { error: 'Credit check failed' },
          { status: 500 }
        )
      }
    }

    let parcel = await fetchParcelByPnu(pnu)
    let seedTransactionId: string | undefined

    if (!parcel && pnu.startsWith('tx-')) {
      const txId = pnu.slice(3)
      const tx = await fetchTransactionById(txId)
      if (tx) {
        parcel = buildSyntheticParcelFromTransaction(tx)
        seedTransactionId = tx.id
      }
    }

    if (!parcel) {
      return NextResponse.json({ error: 'parcel not found' }, { status: 404 })
    }

    const [transactions, nearbyTransactions] = await Promise.all([
      fetchTransactionsByParcel(parcel),
      fetchNearbyTransactions(parcel, seedTransactionId),
    ])

    const hydratedParcel = hydrateParcelWithLatestTransaction(
      parcel,
      transactions
    )
    const analysis = buildLandAnalysisSummary({
      parcel: hydratedParcel,
      transactions,
      nearbyTransactions,
    })
    const snapshot = {
      sample_size: transactions.length + nearbyTransactions.length,
      parcel_transaction_count: transactions.length,
      nearby_transaction_count: nearbyTransactions.length,
    }
    const qualityMeta = deriveLandQualityMeta({
      parcel: hydratedParcel,
      snapshot,
      confidenceHint: analysis.overall_score,
    })

    return NextResponse.json({
      pnu,
      analysis,
      snapshot,
      ...qualityMeta,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'land analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
