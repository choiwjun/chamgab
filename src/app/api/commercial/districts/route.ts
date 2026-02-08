/**
 * GET /api/commercial/districts
 *
 * 전국 시군구 목록 조회 - Supabase regions 테이블 기반
 * ML API 대신 직접 Supabase 조회 (배포 의존성 제거)
 */

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

interface DistrictBasic {
  code: string
  name: string
  description: string
  sido: string | null
  has_data: boolean
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const sidoCode = searchParams.get('sido_code')
    const sigunguCode = searchParams.get('sigungu_code')

    // 1. 상권 데이터가 있는 시군구 코드 수집
    const { data: bizData } = await supabase
      .from('business_statistics')
      .select('sigungu_code')

    const dataCodes = new Set(
      (bizData || []).map((r) => r.sigungu_code).filter(Boolean)
    )

    // 2. 전국 시군구 (level=2) 조회
    let query = supabase
      .from('regions')
      .select('code, name, parent_code')
      .eq('level', 2)
      .order('code')

    if (sidoCode) {
      query = query.like('code', `${sidoCode}%`)
    }
    if (sigunguCode) {
      query = query.like('code', `${sigunguCode}%`)
    }

    // 페이지네이션으로 전체 조회
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

    // 3. 시도명 캐시
    const sidoCache: Record<string, string> = {}

    // 4. DistrictBasic 목록 생성
    const districts: DistrictBasic[] = []

    for (const region of allRegions) {
      const code10 = region.code // 10자리 법정동코드
      const code5 = code10.slice(0, 5) // 5자리 시군구코드
      const name = region.name
      const parentCode = region.parent_code || ''

      // 시도명 조회 (캐시)
      if (parentCode && !sidoCache[parentCode]) {
        const { data: sidoData } = await supabase
          .from('regions')
          .select('name')
          .eq('code', parentCode)
          .limit(1)

        sidoCache[parentCode] = sidoData?.[0]?.name || ''
      }
      const sidoName = sidoCache[parentCode] || null

      const hasData = dataCodes.has(code5)

      districts.push({
        code: code5,
        name,
        description: hasData ? '상권 데이터 보유' : '분석 가능',
        sido: sidoName,
        has_data: hasData,
      })
    }

    // 데이터 있는 지역 우선, 시도→이름 순 정렬
    districts.sort((a, b) => {
      if (a.has_data !== b.has_data) return a.has_data ? -1 : 1
      const sidoCmp = (a.sido || '').localeCompare(b.sido || '')
      if (sidoCmp !== 0) return sidoCmp
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(districts)
  } catch (err) {
    console.error('[Commercial Districts] Exception:', err)
    return NextResponse.json([], { status: 500 })
  }
}
