// @TASK P2-R1-T2 - Properties API - 검색 자동완성
// @SPEC specs/domain/resources.yaml#properties
// @SPEC specs/screens/home.yaml#search_bar (정렬순서: 지역→매물→검색어)

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { SearchSuggestion } from '@/types/property'
import { sanitizeFilterInput } from '@/lib/sanitize'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/**
 * GET /api/properties/autocomplete
 *
 * 검색 자동완성 (지역 + 단지 + 매물)
 * 정렬 순서: 지역(3) → 단지(3) → 매물(4) = 명세 기준
 *
 * Query Parameters:
 * - q: 검색어 (2자 이상 필수)
 * - limit: 결과 개수 제한 (기본: 10, 최대: 20)
 *
 * Response:
 * { suggestions: SearchSuggestion[] }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20)

    // 최소 2자 이상 입력 필요
    if (query.length < 2) {
      return NextResponse.json({
        suggestions: [],
        error: 'Query must be at least 2 characters',
      })
    }

    // PostgREST filter injection 방지: 특수문자 제거
    const sanitizedQuery = sanitizeFilterInput(query)
    if (sanitizedQuery.length < 2) {
      return NextResponse.json({
        suggestions: [],
        error: 'Query must be at least 2 characters after sanitization',
      })
    }

    // 병렬로 모든 검색 실행
    const [regionsResult, complexesResult, propertiesResult] =
      await Promise.all([
        // 1. 지역 검색 (시군구, 읍면동)
        supabase
          .from('regions')
          .select('id, name, level')
          .ilike('name', `%${sanitizedQuery}%`)
          .in('level', [2, 3]) // 시군구, 읍면동만
          .order('level', { ascending: true }) // 시군구 먼저
          .limit(3),

        // 2. 단지 검색
        supabase
          .from('complexes')
          .select('id, name, address')
          .or(
            `name.ilike.%${sanitizedQuery}%,address.ilike.%${sanitizedQuery}%`
          )
          .limit(3),

        // 3. 매물 검색
        supabase
          .from('properties')
          .select('id, name, address')
          .or(
            `name.ilike.%${sanitizedQuery}%,address.ilike.%${sanitizedQuery}%`
          )
          .limit(4),
      ])

    const suggestions: SearchSuggestion[] = []

    // 1. 지역 결과 추가 (최우선)
    if (!regionsResult.error && regionsResult.data) {
      regionsResult.data.forEach((r) => {
        const levelText = r.level === 2 ? '시/군/구' : '읍/면/동'
        suggestions.push({
          id: r.id,
          name: r.name,
          type: 'region',
          description: levelText,
        })
      })
    }

    // 2. 단지 결과 추가
    if (!complexesResult.error && complexesResult.data) {
      complexesResult.data.forEach((c) => {
        suggestions.push({
          id: c.id,
          name: c.name,
          type: 'complex',
          address: c.address,
          description: c.address,
        })
      })
    }

    // 3. 매물 결과 추가
    if (!propertiesResult.error && propertiesResult.data) {
      propertiesResult.data.forEach((p) => {
        suggestions.push({
          id: p.id,
          name: p.name,
          type: 'property',
          address: p.address,
          description: p.address,
        })
      })
    }

    // 결과 제한 및 반환
    return NextResponse.json({
      suggestions: suggestions.slice(0, limit),
    })
  } catch (err) {
    console.error('[Autocomplete API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
