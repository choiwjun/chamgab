// @TASK P2-R1-T2 - Properties API - 검색 자동완성
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { SearchSuggestion } from '@/types/property'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/properties/autocomplete
 *
 * 검색 자동완성 (매물명, 주소 + 단지명)
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

    const suggestions: SearchSuggestion[] = []

    // 매물 검색 (이름, 주소)
    const { data: properties, error: propError } = await supabase
      .from('properties')
      .select('id, name, address')
      .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
      .limit(limit)

    if (propError) {
      return NextResponse.json({ error: propError.message }, { status: 400 })
    }

    // 매물 결과 추가
    if (properties) {
      properties.forEach((p) => {
        suggestions.push({
          id: p.id,
          name: p.name,
          type: 'property',
          address: p.address,
        })
      })
    }

    // 단지 검색 (이름, 주소)
    const { data: complexes, error: compError } = await supabase
      .from('complexes')
      .select('id, name, address')
      .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
      .limit(limit)

    if (compError) {
      return NextResponse.json({ error: compError.message }, { status: 400 })
    }

    // 단지 결과 추가
    if (complexes) {
      complexes.forEach((c) => {
        suggestions.push({
          id: c.id,
          name: c.name,
          type: 'complex',
          address: c.address,
        })
      })
    }

    // 결과 제한 및 반환
    return NextResponse.json({
      suggestions: suggestions.slice(0, limit),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
