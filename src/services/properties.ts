// @TASK P2-R1-T2 - Properties 서비스 계층
// @SPEC docs/planning/04-database-design.md#properties-table
// @SPEC specs/domain/resources.yaml#properties

import { createClient } from "@supabase/supabase-js"
import type {
  Property,
  PropertyQueryParams,
  PropertyResponse,
  SearchSuggestion,
} from "@/types/property"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
)

/**
 * Properties 서비스
 */
export class PropertyService {
  /**
   * 매물 목록 조회 (페이지네이션, 필터링)
   */
  static async listProperties(params: PropertyQueryParams): Promise<PropertyResponse> {
    const {
      sido,
      sigungu,
      property_type,
      min_area,
      max_area,
      page = 1,
      limit = 20,
      sort = "created_at:desc",
    } = params

    let query = supabase.from("properties").select("*", { count: "exact" })

    if (sido) query = query.eq("sido", sido)
    if (sigungu) query = query.eq("sigungu", sigungu)
    if (property_type) query = query.eq("property_type", property_type)
    if (min_area !== undefined) query = query.gte("area_exclusive", min_area)
    if (max_area !== undefined) query = query.lte("area_exclusive", max_area)

    const [sortField, sortOrder] = sort.split(":")
    query = query.order(sortField || "created_at", { ascending: sortOrder === "asc" })

    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data, count, error } = await query
    if (error) throw error

    return { items: data || [], total: count || 0, page, limit }
  }

  /**
   * 단일 매물 조회 (단지 정보 포함)
   */
  static async getPropertyById(id: string): Promise<Property | null> {
    const { data, error } = await supabase
      .from("properties")
      .select("*, complexes:complex_id (id, name, total_units, built_year, brand)")
      .eq("id", id)
      .single()

    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }

    return { ...data, complex: data.complexes || undefined }
  }

  /**
   * 검색 자동완성
   */
  static async autocomplete(query: string, limit: number = 10): Promise<SearchSuggestion[]> {
    if (query.length < 2) return []

    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, address")
      .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
      .limit(limit)

    const { data: complexes } = await supabase
      .from("complexes")
      .select("id, name, address")
      .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
      .limit(limit)

    const suggestions: SearchSuggestion[] = []
    properties?.forEach((p) => suggestions.push({ id: p.id, name: p.name, type: "property", address: p.address }))
    complexes?.forEach((c) => suggestions.push({ id: c.id, name: c.name, type: "complex", address: c.address }))

    return suggestions.slice(0, limit)
  }
}
