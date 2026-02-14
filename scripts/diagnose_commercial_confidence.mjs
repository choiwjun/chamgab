// Diagnose why commercial analysis confidence is low (e.g., stuck at 60%).
//
// Usage:
//   node scripts/diagnose_commercial_confidence.mjs 11680 Q12
//
// Reads `.env` from repo root and checks:
// - Supabase data coverage for business/sales/store_statistics
// - ML API availability and response for /api/commercial/predict

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(p) {
  const txt = fs.readFileSync(p, 'utf8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const k = m[1]
    const v = m[2]
    if (process.env[k] == null) process.env[k] = v
  }
}

function monthsSince(yyyymm) {
  if (!/^\d{6}$/.test(String(yyyymm))) return null
  const y = Number(String(yyyymm).slice(0, 4))
  const m = Number(String(yyyymm).slice(4, 6))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  const now = new Date()
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
}

function calcRuleBasedConfidence({ bizRows, salesRows, storeRows, hasSurvival, hasSales, hasGrowth, hasStoreCount, hasFranchise }) {
  const hasBiz = bizRows.length > 0
  const hasSalesRows = salesRows.length > 0
  const hasStoreRows = storeRows.length > 0

  let c = 45
  if (hasBiz) c += 15
  if (hasSalesRows) c += 15
  if (hasStoreRows) c += 15

  if (hasSurvival) c += 2
  if (hasSales) c += 2
  if (hasGrowth) c += 2
  if (hasStoreCount) c += 2
  if (hasFranchise) c += 2

  const recencyBonus = (mm) => {
    if (mm == null) return 0
    if (mm <= 6) return 4
    if (mm <= 12) return 2
    return 0
  }

  const bizM = hasBiz ? monthsSince(bizRows[0]?.base_year_month) : null
  const salesM = hasSalesRows ? monthsSince(salesRows[0]?.base_year_month) : null
  const storeM = hasStoreRows ? monthsSince(storeRows[0]?.base_year_month) : null
  c += recencyBonus(bizM) + recencyBonus(salesM) + recencyBonus(storeM)

  const allPresent = hasBiz && hasSalesRows && hasStoreRows
  const cap = allPresent ? 90 : 80
  const out = Math.round(Math.min(Math.max(c, 30), cap) * 10) / 10
  return out
}

async function main() {
  const repoRoot = process.cwd()
  const envPath = path.join(repoRoot, '.env')
  if (fs.existsSync(envPath)) loadEnvFile(envPath)

  const districtCode = process.argv[2]
  const industryCode = process.argv[3]
  if (!districtCode || !industryCode) {
    console.error('Usage: node scripts/diagnose_commercial_confidence.mjs <district_code> <industry_code>')
    process.exit(2)
  }

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!sbUrl || !sbKey) {
    console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).')
    process.exit(2)
  }

  const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })

  async function head(table, columns) {
    const { data, error, count } = await supabase
      .from(table)
      .select(columns, { count: 'exact' })
      .eq('sigungu_code', districtCode)
      .eq('industry_small_code', industryCode)
      .order('base_year_month', { ascending: false })
      .limit(1)
    if (error) return { ok: false, error: error.message }
    return { ok: true, count: count ?? null, row: data?.[0] ?? null }
  }

  const [biz, sales, store] = await Promise.all([
    head('business_statistics', 'base_year_month,survival_rate,industry_name'),
    head('sales_statistics', 'base_year_month,monthly_avg_sales,sales_growth_rate,industry_name'),
    head('store_statistics', 'base_year_month,store_count,franchise_count,industry_name'),
  ])

  console.log('--- Supabase Coverage ---')
  console.log('district_code', districtCode, 'industry_code', industryCode)
  console.log('business_statistics', biz)
  console.log('sales_statistics', sales)
  console.log('store_statistics', store)

  const bizRows = biz.ok && biz.row ? [biz.row] : []
  const salesRows = sales.ok && sales.row ? [sales.row] : []
  const storeRows = store.ok && store.row ? [store.row] : []

  const survivalRate = biz.ok ? Number(biz.row?.survival_rate) : NaN
  const monthlyAvgSales = sales.ok ? Number(sales.row?.monthly_avg_sales) : NaN
  const salesGrowthRate = sales.ok ? Number(sales.row?.sales_growth_rate) : NaN
  const storeCount = store.ok ? Number(store.row?.store_count) : NaN
  const franchiseCount = store.ok ? Number(store.row?.franchise_count) : NaN
  const franchiseRatio = Number.isFinite(storeCount) && storeCount > 0 && Number.isFinite(franchiseCount) ? franchiseCount / storeCount : NaN

  const ruleConfidence = calcRuleBasedConfidence({
    bizRows,
    salesRows,
    storeRows,
    hasSurvival: Number.isFinite(survivalRate),
    hasSales: Number.isFinite(monthlyAvgSales),
    hasGrowth: Number.isFinite(salesGrowthRate),
    hasStoreCount: Number.isFinite(storeCount),
    hasFranchise: Number.isFinite(franchiseRatio),
  })
  console.log('rule_based_confidence_expected', ruleConfidence)

  const mlUrl = process.env.ML_API_URL
  if (!mlUrl) {
    console.log('--- ML API ---')
    console.log('ML_API_URL not configured.')
    return
  }

  console.log('--- ML API ---')
  console.log('ML_API_URL', mlUrl)
  const qs = new URLSearchParams({
    district_code: districtCode,
    industry_code: industryCode,
    survival_rate: Number.isFinite(survivalRate) ? String(survivalRate) : '75',
    monthly_avg_sales: Number.isFinite(monthlyAvgSales) ? String(monthlyAvgSales) : '40000000',
    sales_growth_rate: Number.isFinite(salesGrowthRate) ? String(salesGrowthRate) : '3',
    store_count: Number.isFinite(storeCount) ? String(storeCount) : '120',
    franchise_ratio: Number.isFinite(franchiseRatio) ? String(franchiseRatio) : '0.3',
    competition_ratio: '1.2',
  })

  const res = await fetch(`${mlUrl}/api/commercial/predict?${qs.toString()}`, { method: 'POST' })
  const text = await res.text()
  console.log('status', res.status)
  console.log('body_prefix', text.slice(0, 400))
}

main().catch((e) => {
  console.error('fatal', e)
  process.exit(1)
})
