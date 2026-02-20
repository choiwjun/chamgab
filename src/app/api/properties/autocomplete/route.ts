export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { SearchSuggestion } from '@/types/property'
import { buildSearchTerms, normalizeSearchQuery } from '@/lib/sanitize'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase()
}

function buildOrFilter(columns: string[], terms: string[]): string {
  return terms
    .flatMap((term) => columns.map((column) => `${column}.ilike.%${term}%`))
    .join(',')
}

function typeBaseScore(type: SearchSuggestion['type']): number {
  if (type === 'region') return 300
  if (type === 'complex') return 200
  return 100
}

function textMatchScore(text: string, query: string): number {
  if (!text || !query) return 0
  if (text === query) return 100
  if (text.startsWith(query)) return 80
  if (text.includes(query)) return 50
  return 0
}

function calculateSuggestionScore(
  suggestion: SearchSuggestion,
  normalizedTerms: string[],
  popularityClicks: number
): number {
  const name = normalizeText(suggestion.name)
  const desc = normalizeText(suggestion.description || suggestion.address)

  const termScores = normalizedTerms.map((term) => {
    const nameScore = textMatchScore(name, term)
    const descScore = textMatchScore(desc, term)
    return Math.max(nameScore, descScore)
  })

  const bestScore = termScores.length ? Math.max(...termScores) : 0
  const matchedTermCount = termScores.filter((score) => score > 0).length
  const coverageBonus = matchedTermCount * 14
  const lengthBasis = normalizedTerms[0]?.length || 0
  const lengthBonus = Math.max(0, 20 - Math.max(0, name.length - lengthBasis))
  const popularityBonus = Math.min(
    60,
    Math.log2(Math.max(0, popularityClicks) + 1) * 12
  )

  return (
    typeBaseScore(suggestion.type) +
    bestScore * 1.6 +
    coverageBonus +
    lengthBonus +
    popularityBonus
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const rawQuery = searchParams.get('q') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 20)

    const normalizedQuery = normalizeSearchQuery(rawQuery)
    if (normalizedQuery.length < 2) {
      return NextResponse.json({
        suggestions: [],
        error: 'Query must be at least 2 characters',
      })
    }

    const searchTerms = buildSearchTerms(normalizedQuery, 5)
    if (searchTerms.length === 0) {
      return NextResponse.json({ suggestions: [] })
    }

    const fetchLimit = Math.min(30, Math.max(12, limit * 3))

    const [regionsResult, complexesResult, propertiesResult] =
      await Promise.all([
        supabase
          .from('regions')
          .select('id, name, level')
          .in('level', [1, 2, 3])
          .or(buildOrFilter(['name'], searchTerms))
          .order('level', { ascending: true })
          .limit(fetchLimit),
        supabase
          .from('complexes')
          .select('id, name, address, sido, sigungu')
          .or(
            buildOrFilter(['name', 'address', 'sigungu', 'sido'], searchTerms)
          )
          .limit(fetchLimit),
        supabase
          .from('properties')
          .select('id, name, address, sido, sigungu')
          .or(
            buildOrFilter(['name', 'address', 'sigungu', 'sido'], searchTerms)
          )
          .limit(fetchLimit),
      ])

    const suggestions: SearchSuggestion[] = []

    if (!regionsResult.error && regionsResult.data) {
      regionsResult.data.forEach((region: Record<string, unknown>) => {
        const level = Number(region.level || 0)
        const levelText =
          level === 1 ? '시도' : level === 2 ? '시군구' : '읍면동'

        suggestions.push({
          id: String(region.id || ''),
          name: String(region.name || ''),
          type: 'region',
          description: levelText,
          region_level: (level === 1 || level === 2 || level === 3
            ? level
            : 2) as 1 | 2 | 3,
        })
      })
    }

    if (!complexesResult.error && complexesResult.data) {
      complexesResult.data.forEach((complex: Record<string, unknown>) => {
        const regionLabel = [complex.sido, complex.sigungu]
          .filter(Boolean)
          .map(String)
          .join(' ')

        suggestions.push({
          id: String(complex.id || ''),
          name: String(complex.name || ''),
          type: 'complex',
          address: (complex.address as string | undefined) || undefined,
          description:
            (complex.address as string | undefined) || regionLabel || undefined,
        })
      })
    }

    if (!propertiesResult.error && propertiesResult.data) {
      propertiesResult.data.forEach((property: Record<string, unknown>) => {
        const regionLabel = [property.sido, property.sigungu]
          .filter(Boolean)
          .map(String)
          .join(' ')

        suggestions.push({
          id: String(property.id || ''),
          name: String(property.name || ''),
          type: 'property',
          address: (property.address as string | undefined) || undefined,
          description:
            (property.address as string | undefined) ||
            regionLabel ||
            undefined,
        })
      })
    }

    const normalizedTerms = searchTerms.map((term) => normalizeText(term))

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
            .filter((value): value is string =>
              typeof value === 'string' ? value.length > 0 : false
            )
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
    } catch {
      // Ignore popularity table errors if not migrated yet.
    }

    const deduped = new Map<
      string,
      { suggestion: SearchSuggestion; score: number }
    >()

    for (const suggestion of suggestions) {
      if (!suggestion.id && !suggestion.name) continue

      const key = `${suggestion.type}:${suggestion.id || suggestion.name}`
      const clicks = popularityMap.get(key) || 0
      const score = calculateSuggestionScore(
        suggestion,
        normalizedTerms,
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
      .slice(0, limit)

    return NextResponse.json({ suggestions: rankedSuggestions })
  } catch (err) {
    console.error('[Autocomplete API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
