// @TASK P2-R1-T2 - Properties API - 목록 조회
// @SPEC specs/domain/resources.yaml#properties
// @SPEC docs/planning/02-trd.md#properties-api

import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import type { PropertyQueryParams } from "@/types/property"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
)

/**
 * GET /api/properties
 *
 * 매물 목록 조회 (필터, 페이지네이션)
 *
 * Query Parameters:
 * - sido: 시도 필터
 * - sigungu: 시군구 필터
 * - property_type: 매물 유형 (apt, officetel, villa, store, land, building)
 * - min_price: 최소 가격
 * - max_price: 최대 가격
 * - min_area: 최소 면적
 * - max_area: 최대 면적
 * - bounds: 지도 영역 (sw_lat,sw_lng,ne_lat,ne_lng)
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지 사이즈 (기본: 20, 최대: 100)
 * - sort: 정렬 (예: created_at:desc, area_exclusive:asc)
 *
 * Response:
 * { items: Property[], total: number, page: number, limit: number }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Query parameters 파싱
    const sido = searchParams.get("sido") || undefined
    const sigungu = searchParams.get("sigungu") || undefined
    const property_type = searchParams.get("property_type") || undefined
    const min_price = searchParams.get("min_price") ? parseInt(searchParams.get("min_price")!) : undefined
    const max_price = searchParams.get("max_price") ? parseInt(searchParams.get("max_price")!) : undefined
    const min_area = searchParams.get("min_area") ? parseFloat(searchParams.get("min_area")!) : undefined
    const max_area = searchParams.get("max_area") ? parseFloat(searchParams.get("max_area")!) : undefined
    const bounds = searchParams.get("bounds") || undefined
    const page = parseInt(searchParams.get("page") || "1")
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
    const sort = searchParams.get("sort") || "created_at:desc"

    // 기본 쿼리 구성
    let query = supabase.from("properties").select("*", { count: "exact" })

    // 필터 적용
    if (sido) query = query.eq("sido", sido)
    if (sigungu) query = query.eq("sigungu", sigungu)
    if (property_type) query = query.eq("property_type", property_type)
    if (min_area !== undefined) query = query.gte("area_exclusive", min_area)
    if (max_area !== undefined) query = query.lte("area_exclusive", max_area)

    // 지도 영역 필터 (PostGIS 공간 쿼리)
    if (bounds) {
      const [swLat, swLng, neLat, neLng] = bounds.split(',').map(Number)
      // PostGIS ST_MakeEnvelope 사용
      query = query.filter(
        'location',
        'filter',
        `ST_Within(location, ST_MakeEnvelope(${swLng}, ${swLat}, ${neLng}, ${neLat}, 4326))`
      )
    }

    // 정렬 처리
    const [sortField, sortOrder] = sort.split(":")
    query = query.order(sortField || "created_at", { ascending: sortOrder === "asc" })

    // 페이지네이션
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
