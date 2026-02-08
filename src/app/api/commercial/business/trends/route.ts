/**
 * GET /api/commercial/business/trends
 *
 * 비즈니스 트렌드 조회 - 실데이터 기반 시뮬레이션
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  getSupabase,
  fetchSalesStats,
  fetchStoreStats,
  fetchBusinessStats,
  num,
} from '../../_helpers'

/** 간단한 시드 기반 해시 (deterministic variation) */
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash)
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const districtCode = params.get('district_code') || ''
    const industryCode = params.get('industry_code') || ''
    const months = parseInt(params.get('months') || '12', 10)

    if (!districtCode || !industryCode) {
      return NextResponse.json(
        { detail: 'district_code, industry_code 필수' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const sales = await fetchSalesStats(supabase, districtCode, industryCode)
    const stores = await fetchStoreStats(supabase, districtCode, industryCode)
    const biz = await fetchBusinessStats(supabase, districtCode, industryCode)

    let baseSales = 40000000
    let baseStores = 100
    let baseOpen = 10
    let baseClose = 8

    if (sales.length) baseSales = num(sales[0].monthly_avg_sales, 40000000)
    if (stores.length) baseStores = num(stores[0].store_count, 100)
    if (biz.length) {
      baseOpen = num(biz[0].open_count, 10)
      baseClose = num(biz[0].close_count, 8)
    }

    const trends = []
    const now = new Date()
    for (let i = 0; i < months; i++) {
      const periodDate = new Date(now)
      periodDate.setDate(periodDate.getDate() - 30 * (months - i - 1))
      const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`
      const seed = simpleHash(`${districtCode}:${industryCode}:${period}`)
      const variation = ((seed % 200) - 100) / 1000

      trends.push({
        period,
        sales: Math.round(baseSales * (1 + variation)),
        store_count: Math.max(1, baseStores + (seed % 11) - 5),
        open_count: Math.max(0, baseOpen + (seed % 7) - 3),
        close_count: Math.max(0, baseClose + (seed % 5) - 2),
      })
    }

    return NextResponse.json({
      district_code: districtCode,
      industry_code: industryCode,
      trends,
    })
  } catch (err) {
    console.error('[Trends] Exception:', err)
    return NextResponse.json(
      { detail: '트렌드 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
