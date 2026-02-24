// @TASK P3-R3-T2 - Transactions API
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

function normalizeSigungu(sigungu?: string | null): string | null {
  const s = (sigungu || '').trim()
  if (!s) return null
  // Prefer last token when spaces exist.
  const last = s.split(' ').filter(Boolean).slice(-1)[0]
  const candidate = last || s

  // Handle merged forms like "수원시장안구", "부산부산진구" -> extract the last 행정구역 단위.
  const m = candidate.match(/([가-힣]{1,8}(?:구|군|시))$/)
  return (m?.[1] || candidate).trim()
}

async function getComplexFallback(
  supabase: ReturnType<typeof getSupabase>,
  complexId: string
) {
  const { data } = await supabase
    .from('complexes')
    .select('id, name, sigungu, sigungu_code')
    .eq('id', complexId)
    .maybeSingle()

  if (!data?.name) return null
  const s1 = (data.sigungu || '').trim()
  const s2 = normalizeSigungu(s1)
  const sigunguCandidates = Array.from(
    new Set([s1, s2].filter(Boolean))
  ) as string[]

  const sigunguCode = (data as any)?.sigungu_code
    ? String((data as any).sigungu_code).trim()
    : null

  return { aptName: data.name.trim(), sigunguCandidates, sigunguCode }
}

/**
 * GET /api/transactions
 * 거래 목록 조회
 *
 * Query:
 * - complex_id: 단지 ID
 * - property_id: 매물 ID
 * - distinct_areas: true면 단지의 전용면적 목록만 반환
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const searchParams = request.nextUrl.searchParams
    const complex_id = searchParams.get('complex_id')
    const property_id = searchParams.get('property_id')
    const distinctAreas = searchParams.get('distinct_areas') === 'true'

    // distinct_areas 모드: 단지별 고유 전용면적 목록 반환
    if (distinctAreas && complex_id) {
      const { data, error } = await supabase
        .from('transactions')
        .select('area_exclusive')
        .eq('complex_id', complex_id)
        .not('area_exclusive', 'is', null)
        .order('area_exclusive', { ascending: true })

      // If complex_id isn't linked yet, fall back to (apt_name + sigungu) matching.
      if (error || !data || data.length === 0) {
        const fb = await getComplexFallback(supabase, complex_id)
        if (!fb) return NextResponse.json({ areas: [] }, { status: 200 })

        let q = supabase
          .from('transactions')
          .select('area_exclusive')
          .eq('apt_name', fb.aptName)
          .not('area_exclusive', 'is', null)
          .order('area_exclusive', { ascending: true })

        // Prefer LAWD_CD(prefix) when available to avoid ambiguous sigungu ("중구", "동구"...).
        if (fb.sigunguCode) q = q.like('region_code', `${fb.sigunguCode}%`)
        else q = q.in('sigungu', fb.sigunguCandidates)

        const { data: fbData, error: fbErr } = await q

        if (fbErr) return NextResponse.json({ areas: [] }, { status: 503 })

        const unique = Array.from(
          new Set((fbData || []).map((r) => r.area_exclusive as number))
        )
        return NextResponse.json({ areas: unique })
      }

      const unique = Array.from(
        new Set((data || []).map((r) => r.area_exclusive as number))
      )
      return NextResponse.json({ areas: unique })
    }

    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    let query = supabase.from('transactions').select('*', { count: 'exact' })

    if (complex_id) query = query.eq('complex_id', complex_id)
    if (property_id) query = query.eq('property_id', property_id)

    const offset = (page - 1) * limit
    query = query
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      console.error('[Transactions API] Supabase error:', error.message)
      return NextResponse.json(
        { items: [], total: 0, error: 'Database error' },
        { status: 503 }
      )
    }

    // Fallback: if complex_id query returns nothing, try (apt_name + sigungu).
    // This mitigates cases where transactions are collected but not yet linked to complexes.
    if (complex_id && !property_id && (!data || data.length === 0)) {
      const fb = await getComplexFallback(supabase, complex_id)
      if (fb) {
        let q = supabase
          .from('transactions')
          .select('*', { count: 'exact' })
          .eq('apt_name', fb.aptName)
          .order('transaction_date', { ascending: false })
          .range(offset, offset + limit - 1)

        if (fb.sigunguCode) q = q.like('region_code', `${fb.sigunguCode}%`)
        else q = q.in('sigungu', fb.sigunguCandidates)

        const { data: fbItems, count: fbCount, error: fbErr } = await q

        if (!fbErr) {
          return NextResponse.json({
            items: fbItems || [],
            total: fbCount || 0,
            page,
            limit,
          })
        }
      }
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    console.error('[Transactions API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
