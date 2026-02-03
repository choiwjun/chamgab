// @TASK P2-R2 - Regions 서비스 계층
// @SPEC docs/planning/04-database-design.md#regions-table
// @SPEC specs/domain/resources.yaml#regions

import { createClient } from '@supabase/supabase-js'
import type { Region, RegionWithChildren, RegionTrend, RegionQueryParams } from '@/types/region'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * Regions 서비스
 *
 * 지역 정보 조회 및 계층형 데이터 처리
 */
export class RegionService {
  /**
   * 지역 목록 조회 (페이지네이션 포함)
   */
  static async listRegions(params: RegionQueryParams) {
    const {
      level,
      parent_code,
      keyword,
      page = 1,
      limit = 50,
    } = params

    let query = supabase.from('regions').select('*', { count: 'exact' })

    if (level) {
      query = query.eq('level', level)
    }

    if (parent_code) {
      query = query.eq('parent_code', parent_code)
    }

    if (keyword) {
      query = query.ilike('name', `%${keyword}%`)
    }

    const offset = (page - 1) * limit
    const { data, count, error } = await query
      .order('code', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return {
      regions: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    }
  }

  /**
   * 단일 지역 조회
   */
  static async getRegionByCode(code: string) {
    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .eq('code', code)
      .single()

    if (error) throw error
    return data as Region | null
  }

  /**
   * 계층형 지역 구조 조회 (시도 기준)
   */
  static async getHierarchicalRegions(sidoCode?: string) {
    const { data: sidoList, error: sidoError } = await supabase
      .from('regions')
      .select('*')
      .eq('level', 1)
      .order('code', { ascending: true })

    if (sidoError) throw sidoError

    const result: RegionWithChildren[] = []

    for (const sido of sidoList) {
      // 특정 시도만 조회
      if (sidoCode && sido.code !== sidoCode) {
        continue
      }

      const sidoWithChildren: RegionWithChildren = {
        ...sido,
        children: [],
      }

      // 시군구 조회
      const { data: sigunguList, error: sigunguError } = await supabase
        .from('regions')
        .select('*')
        .eq('level', 2)
        .eq('parent_code', sido.code)
        .order('code', { ascending: true })

      if (sigunguError) throw sigunguError

      if (sigunguList) {
        sidoWithChildren.children = sigunguList.map((sigungu) => ({
          ...sigungu,
          children: [],
        }))

        // 각 시군구별 읍면동 조회
        for (const sigungu of sidoWithChildren.children) {
          const { data: eupList, error: eupError } = await supabase
            .from('regions')
            .select('*')
            .eq('level', 3)
            .eq('parent_code', sigungu.code)
            .order('code', { ascending: true })

          if (eupError) throw eupError

          if (eupList) {
            sigungu.children = eupList
          }
        }
      }

      result.push(sidoWithChildren)
    }

    return result
  }

  /**
   * 자식 지역 조회
   */
  static async getChildRegions(parentCode: string) {
    const parent = await this.getRegionByCode(parentCode)
    if (!parent) return []

    const nextLevel = parent.level + 1 as 2 | 3

    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .eq('level', nextLevel)
      .eq('parent_code', parentCode)
      .order('code', { ascending: true })

    if (error) throw error
    return data || []
  }

  /**
   * 가격 트렌드 조회
   */
  static async getTrends(level: 1 | 2 = 2, limit: number = 10, sort: 'price_change' | 'avg_price' = 'price_change') {
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
      .limit(Math.min(limit, 50))

    if (sort === 'price_change') {
      query = query.order('price_change_weekly', { ascending: false, nullsFirst: false })
    } else if (sort === 'avg_price') {
      query = query.order('avg_price', { ascending: false, nullsFirst: false })
    }

    const { data, error } = await query

    if (error) throw error

    // RegionTrend 객체로 변환 (매물 수 포함)
    const trends: RegionTrend[] = await Promise.all(
      (data || []).map(async (region) => {
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

    return trends
  }

  /**
   * 지역 가격 정보 업데이트 (관리자용)
   */
  static async updateRegionPrice(code: string, data: { avg_price?: number; price_change_weekly?: number }) {
    const { error } = await supabase
      .from('regions')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('code', code)

    if (error) throw error
  }

  /**
   * 지역명으로 검색 (자동완성용)
   */
  static async searchRegions(keyword: string, limit: number = 20) {
    if (keyword.length < 1) return []

    const { data, error } = await supabase
      .from('regions')
      .select('id, code, name, level')
      .ilike('name', `%${keyword}%`)
      .order('level', { ascending: true })
      .order('code', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data || []
  }
}
