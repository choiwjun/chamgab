// Land detail visibility checker
//
// Usage:
//   node scripts/check_land_detail_visibility.mjs
//   node scripts/check_land_detail_visibility.mjs --limit 10
//   node scripts/check_land_detail_visibility.mjs --pnu PNU-xxxx
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const txt = fs.readFileSync(filePath, 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (process.env[m[1]] == null) process.env[m[1]] = m[2]
  }
}

function parseArgs(argv) {
  const out = {
    limit: 5,
    pnu: null,
    radiusMeters: 500,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--limit') out.limit = Number(argv[++i] || 5)
    else if (a === '--pnu') out.pnu = String(argv[++i] || '').trim()
    else if (a === '--radius') out.radiusMeters = Number(argv[++i] || 500)
    else if (a === '-h' || a === '--help') out.help = true
    else throw new Error(`Unknown arg: ${a}`)
  }
  if (!Number.isFinite(out.limit) || out.limit <= 0) {
    throw new Error('--limit must be > 0')
  }
  if (!Number.isFinite(out.radiusMeters) || out.radiusMeters <= 0) {
    throw new Error('--radius must be > 0')
  }
  return out
}

function parsePointFromGeometry(location) {
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
    location &&
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

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371000 * c
}

async function queryTransactionsByParcelId(supabase, parcelId) {
  const { data, error } = await supabase
    .from('land_transactions')
    .select('id,transaction_date,price_per_m2', { count: 'exact' })
    .eq('is_cancelled', false)
    .eq('parcel_id', parcelId)
    .order('transaction_date', { ascending: false })
    .limit(200)
  if (error) {
    return { count: 0, rows: [], error: error.message }
  }
  return { count: data?.length || 0, rows: data || [], error: null }
}

async function queryTransactionsExact(supabase, parcel) {
  let q = supabase
    .from('land_transactions')
    .select('id,transaction_date,price_per_m2')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(100)

  if (parcel.eupmyeondong) q = q.eq('eupmyeondong', parcel.eupmyeondong)
  if (parcel.jibun) q = q.eq('jibun', parcel.jibun)

  const { data, error } = await q
  if (error) return { count: 0, rows: [], error: error.message }
  return { count: data?.length || 0, rows: data || [], error: null }
}

async function queryTransactionsRelaxed(supabase, parcel) {
  if (!parcel.eupmyeondong) return { count: 0, rows: [], error: null }
  const { data, error } = await supabase
    .from('land_transactions')
    .select('id,transaction_date,price_per_m2')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .eq('eupmyeondong', parcel.eupmyeondong)
    .order('transaction_date', { ascending: false })
    .limit(100)
  if (error) return { count: 0, rows: [], error: error.message }
  return { count: data?.length || 0, rows: data || [], error: null }
}

async function queryNearbyByRadius(supabase, parcel, radiusMeters) {
  const subjectPoint = parsePointFromGeometry(parcel.location)
  if (!subjectPoint) {
    return { count: 0, mode: 'fallback_no_location' }
  }

  const { data: nearbyParcels, error: parcelError } = await supabase
    .from('land_parcels')
    .select('id,location')
    .eq('sigungu', parcel.sigungu)
    .neq('id', parcel.id)
    .not('location', 'is', null)
    .limit(2000)

  if (parcelError || !nearbyParcels) {
    return { count: 0, mode: 'radius_error' }
  }

  const parcelIds = nearbyParcels
    .map((row) => {
      const pt = parsePointFromGeometry(row.location)
      if (!pt) return null
      const d = haversineDistanceMeters(
        subjectPoint.lat,
        subjectPoint.lng,
        pt.lat,
        pt.lng
      )
      if (d > radiusMeters) return null
      return row.id
    })
    .filter(Boolean)

  if (parcelIds.length === 0) {
    return { count: 0, mode: 'radius_empty' }
  }

  const { data: txRows, error: txError } = await supabase
    .from('land_transactions')
    .select('id')
    .eq('is_cancelled', false)
    .in('parcel_id', parcelIds)
    .limit(50)

  if (txError) {
    return { count: 0, mode: 'radius_tx_error' }
  }

  return { count: txRows?.length || 0, mode: 'radius' }
}

async function queryNearbyFallback(supabase, parcel) {
  let q = supabase
    .from('land_transactions')
    .select('id')
    .eq('is_cancelled', false)
    .eq('sigungu', parcel.sigungu)
    .order('transaction_date', { ascending: false })
    .limit(20)

  if (parcel.eupmyeondong) q = q.eq('eupmyeondong', parcel.eupmyeondong)
  if (parcel.jibun) q = q.neq('jibun', parcel.jibun)

  const { data, error } = await q
  if (error) return { count: 0 }
  return { count: data?.length || 0 }
}

async function checkParcel(supabase, parcel, radiusMeters) {
  const byParcelId = await queryTransactionsByParcelId(supabase, parcel.id)
  const exact = await queryTransactionsExact(supabase, parcel)
  const relaxed = await queryTransactionsRelaxed(supabase, parcel)

  const selectedRows =
    byParcelId.count > 0 ? byParcelId.rows : exact.count > 0 ? exact.rows : relaxed.rows

  const { data: officialRows, error: officialError } = await supabase
    .from('land_prices')
    .select('id,price_year,official_price_per_m2')
    .eq('parcel_id', parcel.id)
    .order('price_year', { ascending: false })
    .limit(10)

  const { data: characteristicsRow, error: characteristicsError } = await supabase
    .from('land_characteristics')
    .select('parcel_id')
    .eq('parcel_id', parcel.id)
    .maybeSingle()

  const yearly = new Set(
    selectedRows
      .filter(
        (tx) => typeof tx.price_per_m2 === 'number' && Number.isFinite(tx.price_per_m2)
      )
      .map((tx) => new Date(tx.transaction_date).getFullYear())
      .filter((year) => Number.isFinite(year))
  )

  const nearbyRadius = await queryNearbyByRadius(supabase, parcel, radiusMeters)
  const nearbyFallback = await queryNearbyFallback(supabase, parcel)
  const nearbyCount = nearbyRadius.count > 0 ? nearbyRadius.count : nearbyFallback.count

  return {
    parcel_id: parcel.id,
    pnu: parcel.pnu,
    sigungu: parcel.sigungu,
    eupmyeondong: parcel.eupmyeondong,
    jibun: parcel.jibun,
    matching: {
      parcel_id_count: byParcelId.count,
      exact_count: exact.count,
      relaxed_count: relaxed.count,
      selected_count: selectedRows.length,
      selected_strategy:
        byParcelId.count > 0 ? 'parcel_id' : exact.count > 0 ? 'exact' : 'relaxed',
    },
    sections: {
      transactions_visible: selectedRows.length > 0,
      official_price_visible: (officialRows || []).length > 0,
      price_trend_visible: yearly.size > 0,
      characteristics_visible: Boolean(characteristicsRow),
      nearby_visible: nearbyCount > 0,
    },
    section_details: {
      official_price_count: (officialRows || []).length,
      price_trend_years: yearly.size,
      nearby_count: nearbyCount,
      nearby_mode: nearbyRadius.count > 0 ? nearbyRadius.mode : 'fallback',
    },
    errors: {
      by_parcel_id: byParcelId.error,
      exact: exact.error,
      relaxed: relaxed.error,
      official: officialError?.message || null,
      characteristics: characteristicsError?.message || null,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: node scripts/check_land_detail_visibility.mjs [--limit 5] [--pnu PNU-xxx] [--radius 500]'
    )
    process.exit(0)
  }

  const root = process.cwd()
  loadEnvFile(path.join(root, '.env.local'))
  loadEnvFile(path.join(root, '.env'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  let parcels = []
  if (args.pnu) {
    const { data, error } = await supabase
      .from('land_parcels')
      .select('id,pnu,sigungu,eupmyeondong,jibun,location')
      .eq('pnu', args.pnu)
      .limit(1)
    if (error) throw new Error(`land_parcels lookup failed: ${error.message}`)
    parcels = data || []
  } else {
    const { data, error } = await supabase
      .from('land_parcels')
      .select('id,pnu,sigungu,eupmyeondong,jibun,location,latest_transaction_date')
      .not('latest_transaction_date', 'is', null)
      .order('latest_transaction_date', { ascending: false })
      .limit(args.limit)
    if (error) throw new Error(`land_parcels sample failed: ${error.message}`)
    parcels = (data || []).map((row) => ({
      id: row.id,
      pnu: row.pnu,
      sigungu: row.sigungu,
      eupmyeondong: row.eupmyeondong,
      jibun: row.jibun,
      location: row.location,
    }))
  }

  if (parcels.length === 0) {
    console.log(JSON.stringify({ ok: false, reason: 'no_parcels_found' }, null, 2))
    process.exit(1)
  }

  const results = []
  for (const parcel of parcels) {
    const checked = await checkParcel(supabase, parcel, args.radiusMeters)
    results.push(checked)
  }

  const aggregate = {
    checked: results.length,
    transactions_visible_count: results.filter((r) => r.sections.transactions_visible).length,
    official_price_visible_count: results.filter((r) => r.sections.official_price_visible).length,
    price_trend_visible_count: results.filter((r) => r.sections.price_trend_visible).length,
    characteristics_visible_count: results.filter((r) => r.sections.characteristics_visible).length,
    nearby_visible_count: results.filter((r) => r.sections.nearby_visible).length,
    selected_strategy_distribution: results.reduce((acc, row) => {
      const k = row.matching.selected_strategy
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {}),
  }

  console.log(JSON.stringify({ ok: true, aggregate, results }, null, 2))
}

main().catch((error) => {
  console.error('[check_land_detail_visibility] failed:', error.message)
  process.exit(1)
})

