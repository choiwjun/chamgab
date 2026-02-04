// @TASK P2-R2-T2 - Regions API - 가격 트렌드
// @SPEC specs/domain/resources.yaml#regions
// @SPEC docs/planning/04-database-design.md#regions-api

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// 동적 렌더링 강제 (searchParams 사용)
export const dynamic = 'force-dynamic'
import type { RegionTrend } from '@/types/region'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/regions/trends
 *
 * 지역별 가격 트렌드 조회
 *
 * 주요 지역(시도/시군구)의 주간 변동률과 평균 가격을 반환합니다.
 * 홈 화면의 "가격 트렌드" 섹션에서 사용됩니다.
 *
 * Query Parameters:
 * - level: 조회 레벨 (1 또는 2, 기본: 2)
 * - limit: 반환할 최대 지역 수 (기본: 10, 최대: 50)
 * - sort: 정렬 기준 ('price_change' 또는 'avg_price', 기본: 'price_change')
 *
 * Response:
 * - RegionTrend[]
 *   - id: 지역 ID
 *   - name: 지역명
 *   - level: 계층 (1 또는 2)
 *   - avg_price: 평균 가격
 *   - price_change_weekly: 주간 변동률 (%)
 *   - property_count: 해당 지역의 매물 수
 *
 * Example:
 * GET /api/regions/trends?level=2&limit=10&sort=price_change
 * Response:
 * [
 *   {
 *     id: "...",
 *     name: "강남구",
 *     level: 2,
 *     avg_price: 3500000000,
 *     price_change_weekly: 0.5,
 *     property_count: 1230
 *   },
 *   ...
 * ]
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Query parameters 파싱
    const level = parseInt(searchParams.get('level') || '2')
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)
    const sort = searchParams.get('sort') || 'price_change'

    if (![1, 2].includes(level)) {
      return NextResponse.json(
        { error: 'Invalid level. Must be 1 or 2.' },
        { status: 400 }
      )
    }

    // 기본 쿼리: avg_price와 price_change_weekly가 NULL이 아닌 지역
    let query = supabase
      .from('regions')
      .select(
        `
        id,
        code,
        name,
        level,
        avg_price,
        price_change_weekly
      `
      )
      .eq('level', level)
      .not('avg_price', 'is', null)

    // 정렬 기준 적용
    if (sort === 'price_change') {
      query = query.order('price_change_weekly', {
        ascending: false,
        nullsFirst: false,
      })
    } else if (sort === 'avg_price') {
      query = query.order('avg_price', { ascending: false, nullsFirst: false })
    }

    query = query.limit(limit)

    const { data: trends, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // RegionTrend 객체로 변환
    const result: RegionTrend[] = await Promise.all(
      (trends || []).map(async (region) => {
        // 각 지역의 매물 수 조회
        const { count } = await supabase
          .from('properties')
          .select('*', { count: 'exact', head: true })
          .eq('sigungu', region.name)

        return {
          id: region.id,
          name: region.name,
          level: region.level,
          avg_price: region.avg_price,
          price_change_weekly: region.price_change_weekly,
          property_count: count || 0,
        }
      })
    )

    return NextResponse.json({
      data: result,
      metadata: {
        level,
        limit,
        sort,
        count: result.length,
      },
    })
  } catch (err) {
    console.error('Error fetching region trends:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
