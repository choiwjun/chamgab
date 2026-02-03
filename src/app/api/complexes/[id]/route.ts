// @TASK P2-R0-T1 - Complexes API - 단일 조회
// @SPEC specs/domain/resources.yaml#complexes

import { NextRequest, NextResponse } from 'next/server'
import { getComplexById } from '@/services/complexes'

/**
 * GET /api/complexes/:id
 *
 * 아파트 단지 상세 조회
 *
 * Path Parameters:
 * - id: 단지 UUID
 *
 * Response:
 * - 200: Complex
 * - 404: { error: 'Complex not found' }
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
      return NextResponse.json(
        { error: 'Invalid complex ID format' },
        { status: 400 }
      )
    }

    const complex = await getComplexById(id)

    if (!complex) {
      return NextResponse.json(
        { error: 'Complex not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(complex, {
      headers: {
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    })
  } catch (error) {
    console.error('[Complexes API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
