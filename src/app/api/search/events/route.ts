// @TASK SEARCH-2 - Search event logging (for ranking)
// Stores only aggregated counters via RPC; no raw event storage.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeFilterInput } from '@/lib/sanitize'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

type EventType = 'autocomplete_select' | 'search_submit'

function clampText(value: unknown, maxLen: number): string {
  const s = typeof value === 'string' ? value : ''
  return s.slice(0, maxLen).trim()
}

function asUuid(value: string | null): string | null {
  if (!value) return null
  const v = value.trim()
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  ) {
    return v
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const event = clampText(body.event, 32) as EventType
    const qRaw = clampText(body.query, 200)
    const query = sanitizeFilterInput(qRaw)

    if (event === 'search_submit') {
      if (query.length >= 1) {
        await supabase.rpc('increment_search_query', { in_query_text: query })
      }
      return new NextResponse(null, { status: 204 })
    }

    if (event === 'autocomplete_select') {
      const suggestion = body.suggestion || {}
      const suggestionType = clampText(suggestion.type, 32)
      const suggestionId = asUuid(clampText(suggestion.id, 64))
      const suggestionName = clampText(suggestion.name, 200)

      if (suggestionType && suggestionName) {
        await supabase.rpc('increment_search_suggestion_click', {
          in_suggestion_type: suggestionType,
          in_suggestion_id: suggestionId,
          in_suggestion_name: suggestionName,
        })
      }

      if (query.length >= 1) {
        await supabase.rpc('increment_search_query', { in_query_text: query })
      }

      return new NextResponse(null, { status: 204 })
    }

    return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  } catch (error) {
    console.error('[Search Events API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
