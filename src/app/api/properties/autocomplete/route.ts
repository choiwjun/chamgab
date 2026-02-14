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

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase()
}

function typeBaseScore(type: SearchSuggestion['type']): number {
  if (type === 'region') return 300
  if (type === 'complex') return 200
  return 100
}

function textMatchScore(text: string, query: string): number {
  if (!text) return 0
  if (text === query) return 100
  if (text.startsWith(query)) return 80
  if (text.includes(query)) return 50
  return 0
}

function calculateSuggestionScore(
  suggestion: SearchSuggestion,
  query: string,
  popularityClicks: number
): number {
  const name = normalizeText(suggestion.name)
  const desc = normalizeText(suggestion.description || suggestion.address)
  const nameScore = textMatchScore(name, query)
  const descScore = textMatchScore(desc, query)
  const lengthBonus = Math.max(0, 20 - Math.max(0, name.length - query.length))
  const popularityBonus = Math.min(
    60,
    Math.log2(Math.max(0, popularityClicks) + 1) * 12
  )

  return (
    typeBaseScore(suggestion.type) +
    nameScore * 1.4 +
    descScore * 0.6 +
    lengthBonus +
    popularityBonus
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

    const fetchLimit = Math.min(30, Math.max(12, limit * 3))

    // 병렬로 후보 검색 실행
    const [regionsResult, complexesResult, propertiesResult] =
      await Promise.all([
        // 1. 지역 검색 (시군구, 읍면동)
        supabase
          .from('regions')
          .select('id, name, level')
          .ilike('name', `%${sanitizedQuery}%`)
          .in('level', [2, 3]) // 시군구, 읍면동만
          .order('level', { ascending: true }) // 시군구 먼저
          .limit(fetchLimit),

        // 2. 단지 검색
        supabase
          .from('complexes')
          .select('id, name, address')
          .or(
            `name.ilike.%${sanitizedQuery}%,address.ilike.%${sanitizedQuery}%`
          )
          .limit(fetchLimit),

        // 3. 매물 검색
        supabase
          .from('properties')
          .select('id, name, address')
          .or(
            `name.ilike.%${sanitizedQuery}%,address.ilike.%${sanitizedQuery}%`
          )
          .limit(fetchLimit),
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

    const normalizedQuery = normalizeText(sanitizedQuery)

    // Optional: popularity boost (click counts). If table/function is not deployed yet, ignore.
    const popularityMap = new Map<string, number>()
    try {
      const idSuggestions = suggestions.filter(
        (s) =>
          (s.type === 'region' ||
            s.type === 'complex' ||
            s.type === 'property') &&
          !!s.id
      )

      const ids = Array.from(
        new Set(
          idSuggestions
            .map((s) => s.id)
            .filter((v): v is string => typeof v === 'string' && v.length > 0)
        )
      )
      if (ids.length > 0) {
        const { data: statsById } = await supabase
          .from('search_suggestion_stats')
          .select(
            'suggestion_type, suggestion_id, suggestion_name, click_count'
          )
          .in('suggestion_id', ids)
          .limit(200)

        ;(statsById || []).forEach((row: Record<string, unknown>) => {
          const type = String(row.suggestion_type || '')
          const id = row.suggestion_id ? String(row.suggestion_id) : ''
          const name = String(row.suggestion_name || '')
          const key = `${type}:${id || name}`
          const clicks = Number(row.click_count || 0)
          popularityMap.set(key, Math.max(0, clicks))
        })
      }

      const keywordNames = Array.from(
        new Set(
          suggestions
            // SearchSuggestion here is '@/types/property' which doesn't include 'keyword'.
            // Keep branch for forward-compat if we add keyword suggestions later.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((s: any) => s.type === 'keyword' && !s.id)
            .map((s) => s.name)
            .filter((v) => typeof v === 'string' && v.length > 0)
        )
      )
      if (keywordNames.length > 0) {
        const { data: statsByKeyword } = await supabase
          .from('search_suggestion_stats')
          .select(
            'suggestion_type, suggestion_id, suggestion_name, click_count'
          )
          .eq('suggestion_type', 'keyword')
          .in('suggestion_name', keywordNames)
          .limit(200)

        ;(statsByKeyword || []).forEach((row: Record<string, unknown>) => {
          const type = String(row.suggestion_type || '')
          const id = row.suggestion_id ? String(row.suggestion_id) : ''
          const name = String(row.suggestion_name || '')
          const key = `${type}:${id || name}`
          const clicks = Number(row.click_count || 0)
          popularityMap.set(key, Math.max(0, clicks))
        })
      }
    } catch {
      // ignore popularity errors (migration may not be applied yet)
    }

    const deduped = new Map<
      string,
      { suggestion: SearchSuggestion; score: number }
    >()
    for (const suggestion of suggestions) {
      const key = `${suggestion.type}:${suggestion.id || suggestion.name}`
      const clicks = popularityMap.get(key) || 0
      const score = calculateSuggestionScore(
        suggestion,
        normalizedQuery,
        clicks
      )
      const prev = deduped.get(key)
      if (!prev || score > prev.score) {
        deduped.set(key, { suggestion, score })
      }
    }

    const rankedSuggestions = Array.from(deduped.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.suggestion.name.length - b.suggestion.name.length
      })
      .map((item) => item.suggestion)

    return NextResponse.json({
      suggestions: rankedSuggestions.slice(0, limit),
    })
  } catch (err) {
    console.error('[Autocomplete API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
