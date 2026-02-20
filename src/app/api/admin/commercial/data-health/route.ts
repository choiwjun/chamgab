export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'
import { createAdminClient } from '@/lib/supabase/admin'

function monthsSince(yyyymm: string): number | null {
  if (!/^\d{6}$/.test(yyyymm)) return null
  const y = Number(yyyymm.slice(0, 4))
  const m = Number(yyyymm.slice(4, 6))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const now = new Date()
  const ny = now.getFullYear()
  const nm = now.getMonth() + 1
  return (ny - y) * 12 + (nm - m)
}

async function tableHealth(args: {
  table: string
  districtCode?: string
  industryCode?: string
}) {
  const admin = createAdminClient()

  let qLatest = admin
    .from(args.table)
    .select('base_year_month', { count: 'exact' })
    .order('base_year_month', { ascending: false })
    .limit(1)

  if (args.districtCode) qLatest = qLatest.eq('sigungu_code', args.districtCode)
  if (args.industryCode)
    qLatest = qLatest.eq('industry_small_code', args.industryCode)

  const { data, count, error } = await qLatest
  if (error) {
    return {
      ok: false as const,
      error: error.message,
    }
  }

  const latest = String(data?.[0]?.base_year_month || '')
  return {
    ok: true as const,
    latest_base_year_month: latest || null,
    months_since_latest: latest ? monthsSince(latest) : null,
    row_count: count ?? null,
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  const sp = req.nextUrl.searchParams
  const districtCode = (sp.get('district_code') || '').trim() || undefined
  const industryCode = (sp.get('industry_code') || '').trim() || undefined

  const [biz, sales, store] = await Promise.all([
    tableHealth({
      table: 'business_statistics',
      districtCode,
      industryCode,
    }),
    tableHealth({
      table: 'sales_statistics',
      districtCode,
      industryCode,
    }),
    tableHealth({
      table: 'store_statistics',
      districtCode,
      industryCode,
    }),
  ])

  return NextResponse.json({
    as_of: new Date().toISOString(),
    filters: {
      district_code: districtCode || null,
      industry_code: industryCode || null,
    },
    tables: {
      business_statistics: biz,
      sales_statistics: sales,
      store_statistics: store,
    },
  })
}
