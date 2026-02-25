// @TASK Land Detail Page - Individual parcel view with transaction history
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { LandDetailClient } from '@/components/land/LandDetailClient'
import type {
  LandParcel,
  LandTransaction,
  LandOfficialPrice,
  LandCharacteristics,
  LandMapPoint,
} from '@/types/land'
import type { QualityGateStatus, QualityGrade } from '@/types/quality'
import { buildLandAnalysisSummary } from '@/lib/land/analysis'
import { buildLandValuationSummaryWithMl } from '@/lib/land/valuation'

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

  // 1) Preferred path: direct parcel_id match (most accurate, avoids jibun format mismatch)
  if (parcel.id && !parcel.id.startsWith('tx-')) {
    const { data: byParcelId, error: byParcelIdError } = await supabase
      .from('land_transactions')
      .select('*')
      .eq('is_cancelled', false)
      .eq('parcel_id', parcel.id)
      .order('transaction_date', { ascending: false })
      .limit(200)

    if (byParcelIdError) {
      console.error(
        '[LandDetail] Transactions by parcel_id error:',
        byParcelIdError.message
      )
    } else if ((byParcelId || []).length > 0) {
      return byParcelId as LandTransaction[]
    }
  }

  // 2) Fallback path: region + dong + jibun
  let exactQuery = supabase
    .from('land_transactions')
    .select('*')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(100)

  if (parcel.eupmyeondong) {
    exactQuery = exactQuery.eq('eupmyeondong', parcel.eupmyeondong)
  }
  if (parcel.jibun) {
    exactQuery = exactQuery.eq('jibun', parcel.jibun)
  }

  const { data: exactData, error: exactError } = await exactQuery

  if (exactError) {
    console.error(
      '[LandDetail] Transactions exact match error:',
      exactError.message
    )
    return []
  }

  if ((exactData || []).length > 0) {
    return exactData as LandTransaction[]
  }

  // 3) Relaxed fallback when jibun exact match misses due source normalization differences
  if (parcel.eupmyeondong) {
    const { data: relaxedData, error: relaxedError } = await supabase
      .from('land_transactions')
      .select('*')
      .eq('is_cancelled', false)
      .eq('sigungu', parcel.sigungu)
      .eq('eupmyeondong', parcel.eupmyeondong)
      .order('transaction_date', { ascending: false })
      .limit(100)

    if (relaxedError) {
      console.error(
        '[LandDetail] Transactions relaxed fallback error:',
        relaxedError.message
      )
      return []
    }

    return (relaxedData || []) as LandTransaction[]
  }

  return []
}

async function fetchNearbyTransactions(
  parcel: LandParcel,
  excludeTransactionId?: string
): Promise<{ rows: LandTransaction[]; mode: 'radius' | 'fallback' }> {
  const supabase = getSupabase()

  const nearbyParcels = await fetchNearbyParcelsWithinRadius(parcel, 500, 200)

  if (nearbyParcels.length > 0) {
    const nearbyParcelIds = nearbyParcels.map((row) => row.id).filter(Boolean)
    let query = supabase
      .from('land_transactions')
      .select('*')
      .eq('is_cancelled', false)
      .in('parcel_id', nearbyParcelIds)
      .order('transaction_date', { ascending: false })
      .limit(50)

    if (excludeTransactionId) {
      query = query.neq('id', excludeTransactionId)
    }
    if (parcel.id && !parcel.id.startsWith('tx-')) {
      query = query.neq('parcel_id', parcel.id)
    }

    const { data, error } = await query
    if (error) {
      console.error(
        '[LandDetail] Nearby transactions (radius) error:',
        error.message
      )
      return { rows: [], mode: 'fallback' }
    }
    return { rows: (data || []) as LandTransaction[], mode: 'radius' }
  }

  // Fallback when subject parcel has no coordinates (e.g. synthetic tx-* parcel)
  let fallbackQuery = supabase
    .from('land_transactions')
    .select('*')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(20)

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
  if (error) {
    console.error(
      '[LandDetail] Nearby transactions (fallback) error:',
      error.message
    )
    return { rows: [], mode: 'fallback' }
  }
  return { rows: (data || []) as LandTransaction[], mode: 'fallback' }
}

async function fetchOfficialPrices(
  parcelId: string
): Promise<LandOfficialPrice[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_prices')
    .select('*')
    .eq('parcel_id', parcelId)
    .order('price_year', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[LandDetail] Official prices error:', error.message)
    return []
  }

  return (data || []) as LandOfficialPrice[]
}

async function fetchLandCharacteristics(
  parcelId: string
): Promise<LandCharacteristics | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_characteristics')
    .select('*')
    .eq('parcel_id', parcelId)
    .single()

  if (error || !data) return null
  return data as LandCharacteristics
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
    land_category: string | null
    location: LandParcel['location']
    latest_transaction_price: number | null
    latest_transaction_date: string | null
  }>
> {
  const subjectPoint = parsePointFromGeometry(parcel.location)
  if (!subjectPoint) return []

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('land_parcels')
    .select(
      'id,pnu,eupmyeondong,jibun,land_category,location,latest_transaction_price,latest_transaction_date'
    )
    .eq('sigungu', parcel.sigungu)
    .neq('id', parcel.id)
    .not('location', 'is', null)
    .limit(2000)

  if (error || !data) return []

  const rows = (data as Array<Record<string, unknown>>)
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
        land_category: row.land_category ? String(row.land_category) : null,
        location: (row.location as LandParcel['location']) || null,
        latest_transaction_price:
          typeof row.latest_transaction_price === 'number'
            ? row.latest_transaction_price
            : null,
        latest_transaction_date:
          typeof row.latest_transaction_date === 'string'
            ? row.latest_transaction_date
            : null,
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
        land_category: string | null
        location: LandParcel['location']
        latest_transaction_price: number | null
        latest_transaction_date: string | null
      } => Boolean(row)
    )

  return rows.slice(0, limit)
}

async function fetchNearbyMapPoints(
  parcel: LandParcel
): Promise<LandMapPoint[]> {
  const subjectPoint = parsePointFromGeometry(parcel.location)
  const points: LandMapPoint[] = []

  if (subjectPoint) {
    points.push({
      id: parcel.id,
      title:
        `${parcel.eupmyeondong || ''} ${parcel.jibun || ''}`.trim() ||
        parcel.pnu,
      lat: subjectPoint.lat,
      lng: subjectPoint.lng,
      kind: 'subject',
      land_category: parcel.land_category,
      transaction_price: parcel.latest_transaction_price,
      transaction_date: parcel.latest_transaction_date,
    })
  }

  const nearbyParcels = await fetchNearbyParcelsWithinRadius(parcel, 500, 24)
  for (const row of nearbyParcels) {
    const point = parsePointFromGeometry(row.location)
    if (!point) continue

    points.push({
      id: row.id || row.pnu || `nearby-${points.length + 1}`,
      title:
        `${row.eupmyeondong || ''} ${row.jibun || ''}`.trim() ||
        row.pnu ||
        'Nearby parcel',
      lat: point.lat,
      lng: point.lng,
      kind: 'nearby',
      land_category: row.land_category,
      transaction_price: row.latest_transaction_price,
      transaction_date: row.latest_transaction_date,
    })
  }

  return points.slice(0, 25)
}

function buildYearlyPriceTrend(transactions: LandTransaction[]) {
  const prices = transactions
    .filter(
      (tx): tx is LandTransaction & { price_per_m2: number } =>
        typeof tx.price_per_m2 === 'number' &&
        Number.isFinite(tx.price_per_m2) &&
        tx.price_per_m2 > 0
    )
    .map((tx) => ({
      year: new Date(tx.transaction_date).getFullYear(),
      price_per_m2: tx.price_per_m2,
    }))
    .filter((row) => Number.isFinite(row.year) && row.year > 0)

  const yearly = new Map<number, { total: number; count: number }>()
  for (const row of prices) {
    const current = yearly.get(row.year) || { total: 0, count: 0 }
    current.total += row.price_per_m2
    current.count += 1
    yearly.set(row.year, current)
  }

  return Array.from(yearly.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, agg]) => ({
      year,
      avg_price_per_m2: Math.round(agg.total / Math.max(agg.count, 1)),
    }))
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
  }
}

interface PageProps {
  params: Promise<{ pnu: string }>
}

export default async function LandDetailPage({ params }: PageProps) {
  const { pnu } = await params
  const decodedPnu = decodeURIComponent(pnu)

  let parcel = await fetchParcelByPnu(decodedPnu)
  let seedTransactionId: string | undefined

  if (!parcel && decodedPnu.startsWith('tx-')) {
    const txId = decodedPnu.slice(3)
    const tx = await fetchTransactionById(txId)
    if (tx) {
      parcel = buildSyntheticParcelFromTransaction(tx)
      seedTransactionId = tx.id
    }
  }

  if (!parcel) {
    notFound()
  }

  const [
    transactions,
    nearbyResult,
    officialPrices,
    characteristics,
    nearbyMapPoints,
  ] = await Promise.all([
    fetchTransactionsByParcel(parcel),
    fetchNearbyTransactions(parcel, seedTransactionId),
    parcel.id.startsWith('tx-')
      ? Promise.resolve([])
      : fetchOfficialPrices(parcel.id),
    parcel.id.startsWith('tx-')
      ? Promise.resolve(null)
      : fetchLandCharacteristics(parcel.id),
    fetchNearbyMapPoints(parcel),
  ])
  const hydratedParcel = hydrateParcelWithLatestTransaction(
    parcel,
    transactions
  )
  const analysis = buildLandAnalysisSummary({
    parcel: hydratedParcel,
    transactions,
    nearbyTransactions: nearbyResult.rows,
  })
  const snapshot = {
    sample_size: transactions.length + nearbyResult.rows.length,
    parcel_transaction_count: transactions.length,
    nearby_transaction_count: nearbyResult.rows.length,
  }
  const quality = deriveLandQualityMeta({
    parcel: hydratedParcel,
    snapshot,
    confidenceHint: analysis.overall_score,
  })
  const valuation = await buildLandValuationSummaryWithMl({
    parcel: hydratedParcel,
    transactions,
    nearbyTransactions: nearbyResult.rows,
    officialPrices,
  })
  const officialPrice = officialPrices[0] || null
  const priceTrend = buildYearlyPriceTrend(transactions)

  return (
    <main className="min-h-screen bg-[#F9FAFB]">
      <LandDetailClient
        parcel={hydratedParcel}
        transactions={transactions}
        nearbyTransactions={nearbyResult.rows}
        nearbyTransactionsMode={nearbyResult.mode}
        officialPrice={officialPrice}
        officialPrices={officialPrices}
        priceTrend={priceTrend}
        characteristics={characteristics}
        analysis={analysis}
        valuation={valuation}
        nearbyMapPoints={nearbyMapPoints}
        quality={quality}
      />
    </main>
  )
}
