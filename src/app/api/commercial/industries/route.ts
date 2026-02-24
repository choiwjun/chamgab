/**
 * GET /api/commercial/industries
 * Industry list + data availability.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/lib/server/request-rate-limit'
import { getSupabase, getIndustryCategory, INDUSTRY_NAMES } from '../_helpers'

type IndustryItem = {
  code: string
  name: string
  category: string
  description: string
  has_data: boolean
}

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || 'unknown'
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-vercel-forwarded-for') ||
    'unknown'
  )
}

function buildStaticIndustries(): IndustryItem[] {
  return Object.entries(INDUSTRY_NAMES).map(([code, name]) => {
    const category = getIndustryCategory(code)
    return {
      code,
      name,
      category,
      description: `${category} > ${name}`,
      has_data: false,
    }
  })
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = enforceRateLimit({
    key: `commercial:industries:${ip}`,
    limit: 60,
    windowMs: 60_000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    )
  }

  try {
    const supabase = getSupabase()
    const category = request.nextUrl.searchParams.get('category')

    const dbCodes = new Set<string>()
    const dbNames: Record<string, string> = {}
    const { data: industryRows } = await supabase.rpc(
      'get_commercial_industry_codes'
    )
    for (const row of industryRows || []) {
      const code = String(row.industry_small_code || '').trim()
      if (!code) continue
      dbCodes.add(code)
      if (!dbNames[code]) dbNames[code] = String(row.industry_name || '').trim()
    }

    const staticItems = buildStaticIndustries()
    const seen = new Set<string>()
    let industries: IndustryItem[] = []

    for (const item of staticItems) {
      seen.add(item.code)
      const hasData = dbCodes.has(item.code)
      const resolvedName = dbNames[item.code] || item.name
      industries.push({
        ...item,
        name: resolvedName,
        description: `${item.category} > ${resolvedName}`,
        has_data: hasData,
      })
    }

    for (const code of Array.from(dbCodes)) {
      if (seen.has(code)) continue
      const name = dbNames[code] || code
      const cat = getIndustryCategory(code)
      industries.push({
        code,
        name,
        category: cat,
        description: `${cat} > ${name}`,
        has_data: true,
      })
      seen.add(code)
    }

    if (category) industries = industries.filter((i) => i.category === category)

    industries.sort((a, b) => {
      if (a.has_data !== b.has_data) return a.has_data ? -1 : 1
      const catCmp = a.category.localeCompare(b.category)
      if (catCmp !== 0) return catCmp
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(industries, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[Industries] Exception:', err)
    return NextResponse.json([], { status: 500 })
  }
}

