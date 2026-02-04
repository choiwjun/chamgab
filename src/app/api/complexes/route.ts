// @TASK P2-R0-T1 - Complexes API - 목록 조회
// @SPEC specs/domain/resources.yaml#complexes

import { NextRequest, NextResponse } from 'next/server'

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'
import { getComplexes, getComplexesByBrand } from '@/services/complexes'

/**
 * GET /api/complexes
 *
 * 아파트 단지 목록 조회
 *
 * Query Parameters:
 * - sido: 시도 필터 (예: 서울시)
 * - sigungu: 시군구 필터 (예: 강남구)
 * - brand: 브랜드 필터 (예: 래미안, 자이)
 * - keyword: 단지명 검색
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지 사이즈 (기본: 20, 최대: 100)
 *
 * Response:
 * {
 *   items: Complex[],
 *   total: number,
 *   page: number,
 *   limit: number
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Query parameters 파싱
    const sido = searchParams.get('sido') || undefined
    const sigungu = searchParams.get('sigungu') || undefined
    const brand = searchParams.get('brand') || undefined
    const keyword = searchParams.get('keyword') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20'))
    )

    // 브랜드 필터가 있으면 브랜드 전용 조회
    if (brand && !sido && !sigungu && !keyword) {
      const result = await getComplexesByBrand(brand, page, limit)
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      })
    }

    // 일반 조회
    const result = await getComplexes({
      sido,
      sigungu,
      keyword,
      page,
      limit,
    })

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
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
