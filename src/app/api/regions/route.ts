// @TASK P2-R2-T2 - Regions API - 지역 목록 조회
// @SPEC specs/domain/resources.yaml#regions
// @SPEC docs/planning/04-database-design.md#regions-api

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { RegionWithChildren, RegionQueryParams } from '@/types/region'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * GET /api/regions
 *
 * 지역 목록 조회 (계층형)
 *
 * Query Parameters:
 * - level: 계층 레벨 (1, 2, 3)
 * - parent_code: 상위 지역 코드 (parent_code 필터)
 * - keyword: 검색어 (지역명)
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지 사이즈 (기본: 50, 최대: 100)
 *
 * Response:
 * - 단일 레벨 조회: Region[]
 * - 최상위 조회 (level=1, parent_code 없음): RegionWithChildren[] (계층형)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Query parameters 파싱
    const level = searchParams.get('level') ? parseInt(searchParams.get('level')!) : undefined
    const parent_code = searchParams.get('parent_code') || undefined
    const keyword = searchParams.get('keyword') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const offset = (page - 1) * limit

    // 기본 쿼리 구성
    let query = supabase.from('regions').select('*', { count: 'exact' })

    // 필터 적용
    if (level !== undefined) {
      query = query.eq('level', level)
    }

    if (parent_code) {
      query = query.eq('parent_code', parent_code)
    }

    if (keyword) {
      query = query.ilike('name', `%${keyword}%`)
    }

    // 정렬 및 페이지네이션
    query = query.order('code', { ascending: true }).range(offset, offset + limit - 1)

    const { data: regions, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // 최상위 레벨 조회 시 계층형 구조 반환
    if (!level && !parent_code) {
      const regionsByLevel = await buildHierarchy(regions || [])
      return NextResponse.json({
        data: regionsByLevel,
        pagination: {
          page,
          limit,
          total: count || 0,
          pages: Math.ceil((count || 0) / limit),
        },
      })
    }

    // 단일 레벨 조회
    return NextResponse.json({
      data: regions || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * 계층형 지역 구조 구성
 */
async function buildHierarchy(regions: any[]): Promise<RegionWithChildren[]> {
  // 레벨 1 (시도) 조회
  const { data: sidoList } = await supabase
    .from('regions')
    .select('*')
    .eq('level', 1)
    .order('code', { ascending: true })

  if (!sidoList) return []

  // 각 시도별 자식 구성
  const result: RegionWithChildren[] = []

  for (const sido of sidoList) {
    const sido_with_children: RegionWithChildren = {
      ...sido,
      children: [],
    }

    // 시군구 조회
    const { data: sigunguList } = await supabase
      .from('regions')
      .select('*')
      .eq('level', 2)
      .eq('parent_code', sido.code)
      .order('code', { ascending: true })

    if (sigunguList) {
      sido_with_children.children = sigunguList.map((sigungu) => ({
        ...sigungu,
        children: [],
      }))

      // 각 시군구별 읍면동 조회
      for (const sigungu of sido_with_children.children) {
        const { data: eupList } = await supabase
          .from('regions')
          .select('*')
          .eq('level', 3)
          .eq('parent_code', sigungu.code)
          .order('code', { ascending: true })

        if (eupList) {
          sigungu.children = eupList
        }
      }
    }

    result.push(sido_with_children)
  }

  return result
}
