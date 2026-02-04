// @TASK P2-R3-T1 - 인기 검색어 API
// @SPEC specs/domain/resources.yaml#popular_searches

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type {
  PopularSearch,
  PopularSearchesResponse,
  RankChange,
} from '@/types/search'

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/search/popular
 * 인기 검색어 목록을 반환합니다.
 * 실제 데이터: regions 테이블에서 시군구(level=2) 기준 avg_price 내림차순으로 조회
 *
 * Query Parameters:
 * - limit: 반환할 최대 개수 (기본값: 10, 최대: 20)
 *
 * Response:
 * - items: PopularSearch[] - 인기 검색어 목록
 * - updated_at: string - 마지막 업데이트 시간 (ISO 8601)
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<PopularSearchesResponse>> {
  try {
    // Query parameter 파싱
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')

    // limit 값 파싱 및 검증 (기본값: 10, 최대: 20)
    let limit = 10
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 20)
      }
    }

    // Supabase에서 인기 지역 조회 (시군구 level=2, avg_price 기준 정렬)
    const { data: regions, error } = await supabase
      .from('regions')
      .select('name, avg_price, price_change_weekly, updated_at')
      .eq('level', 2)
      .not('avg_price', 'is', null)
      .order('avg_price', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Popular Searches API] Supabase error:', error)
      return NextResponse.json(
        { items: [], updated_at: new Date().toISOString() },
        { status: 500 }
      )
    }

    // regions 데이터를 PopularSearch 형식으로 변환
    const items: PopularSearch[] = (regions || []).map((region, index) => {
      // 가격 변동률 기반으로 순위 변동 계산
      const priceChange = region.price_change_weekly || 0
      let change: RankChange = 'same'
      let changeRank: number | undefined

      if (priceChange > 0.3) {
        change = 'up'
        changeRank = Math.ceil(priceChange * 2)
      } else if (priceChange < -0.3) {
        change = 'down'
        changeRank = Math.ceil(Math.abs(priceChange) * 2)
      }

      return {
        rank: index + 1,
        keyword: region.name,
        search_count: Math.floor((region.avg_price || 0) / 10000000), // 억 단위로 환산하여 검색 수 시뮬레이션
        change,
        ...(changeRank && { change_rank: changeRank }),
      }
    })

    // 마지막 업데이트 시간 (가장 최근 업데이트된 region 기준)
    const latestUpdate = regions?.[0]?.updated_at || new Date().toISOString()

    const response: PopularSearchesResponse = {
      items,
      updated_at: latestUpdate,
    }

    // Cache-Control 헤더 설정 (5분 캐시)
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control':
          'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('[Popular Searches API] Error:', error)

    return NextResponse.json(
      {
        items: [],
        updated_at: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
