/**
 * GET /api/commercial/districts
 * Commercial districts list by regions table + business coverage.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/lib/server/request-rate-limit'
import { getSupabase } from '../_helpers'

interface DistrictBasic {
  code: string
  name: string
  description: string
  sido: string | null
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

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = enforceRateLimit({
    key: `commercial:districts:${ip}`,
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
    const searchParams = request.nextUrl.searchParams
    const sidoCode = searchParams.get('sido_code')
    const sigunguCode = searchParams.get('sigungu_code')

    const { data: sigunguRows } = await supabase.rpc(
      'get_commercial_sigungu_codes'
    )
    const sigunguList = (sigunguRows || []) as Array<{
      sigungu_code: string | null
    }>
    const dataCodes = new Set(
      sigunguList
        .map((row) => String(row.sigungu_code || '').trim())
        .filter(Boolean)
    )

    let query = supabase
      .from('regions')
      .select('code, name, parent_code')
      .eq('level', 2)
      .order('code')

    if (sidoCode) query = query.like('code', `${sidoCode}%`)
    if (sigunguCode) query = query.like('code', `${sigunguCode}%`)

    const allRegions: { code: string; name: string; parent_code: string }[] = []
    let offset = 0
    while (true) {
      const { data, error } = await query.range(offset, offset + 999)
      if (error) {
        console.error('[Commercial Districts] Supabase error:', error.message)
        break
      }
      if (!data || data.length === 0) break
      allRegions.push(...data)
      if (data.length < 1000) break
      offset += 1000
    }

    const parentCodes = Array.from(
      new Set(
        allRegions
          .map((row) => String(row.parent_code || '').trim())
          .filter(Boolean)
      )
    )

    const sidoMap = new Map<string, string>()
    if (parentCodes.length > 0) {
      const { data: sidoRows } = await supabase
        .from('regions')
        .select('code,name')
        .in('code', parentCodes)
      for (const row of sidoRows || []) {
        sidoMap.set(String(row.code), String(row.name || ''))
      }
    }

    const districts: DistrictBasic[] = allRegions.map((region) => {
      const code10 = region.code
      const code5 = code10.slice(0, 5)
      const hasData = dataCodes.has(code5)
      const parentCode = String(region.parent_code || '').trim()

      return {
        code: code5,
        name: region.name,
        description: hasData ? '상권 데이터 보유' : '분석 가능',
        sido: parentCode ? sidoMap.get(parentCode) || null : null,
        has_data: hasData,
      }
    })

    districts.sort((a, b) => {
      if (a.has_data !== b.has_data) return a.has_data ? -1 : 1
      const sidoCmp = (a.sido || '').localeCompare(b.sido || '')
      if (sidoCmp !== 0) return sidoCmp
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(districts, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[Commercial Districts] Exception:', err)
    return NextResponse.json([], { status: 500 })
  }
}
