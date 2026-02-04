// @TASK P2-R1-T2 - Properties API - 단일 조회
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

// 동적 렌더링 강제 (Supabase 사용)
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/properties/:id
 *
 * 단일 매물 조회 (단지 정보 포함)
 *
 * Response:
 * Property (with complex info joined)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // UUID 형식 검증
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID format' }, { status: 400 })
    }

    // 단지 정보 조인하여 조회
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        complexes:complex_id (
          id,
          name,
          total_units,
          total_buildings,
          built_year,
          brand
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // 응답 형식 변환 (complexes -> complex)
    const property = {
      ...data,
      complex: data.complexes || undefined,
    }
    delete property.complexes

    return NextResponse.json(property)
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
