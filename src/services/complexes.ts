// @TASK P2-R0-T1 - Complexes 서비스 레이어
// @SPEC specs/domain/resources.yaml#complexes

import { createClient } from '@supabase/supabase-js'
import type { Complex, ComplexSearchParams } from '@/types/complex'
import { sanitizeFilterInput } from '@/lib/sanitize'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export interface ComplexListResult {
  items: Complex[]
  total: number
  page: number
  limit: number
}

/**
 * 아파트 단지 목록 조회
 */
export async function getComplexes(
  params: ComplexSearchParams
): Promise<ComplexListResult> {
  const { sido, sigungu, keyword, page = 1, limit = 20 } = params
  const offset = (page - 1) * limit

  let query = supabase.from('complexes').select('*', { count: 'exact' })

  // 필터 적용
  if (sido) {
    query = query.eq('sido', sido)
  }
  if (sigungu) {
    // 선택 필터는 정확 매칭으로 처리 (검색어 조건과 충돌 방지)
    const sanitizedSigungu = sanitizeFilterInput(sigungu)
    if (sanitizedSigungu) {
      query = query.eq('sigungu', sanitizedSigungu)
    }
  }
  if (keyword) {
    // 키워드가 지역명일 수 있으므로 이름, 시군구, 주소에서 모두 검색
    const sanitizedKeyword = sanitizeFilterInput(keyword)
    if (sanitizedKeyword) {
      query = query.or(
        `name.ilike.%${sanitizedKeyword}%,sigungu.ilike.%${sanitizedKeyword}%,address.ilike.%${sanitizedKeyword}%`
      )
    }
  }

  // 정렬 및 페이지네이션
  query = query
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // location 변환 (PostGIS GEOGRAPHY → lat/lng)
  const items = (data || []).map(transformComplex)

  return {
    items,
    total: count || 0,
    page,
    limit,
  }
}

/**
 * 아파트 단지 단일 조회
 */
export async function getComplexById(id: string): Promise<Complex | null> {
  const { data, error } = await supabase
    .from('complexes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Not found
    }
    throw new Error(error.message)
  }

  return transformComplex(data)
}

/**
 * 브랜드별 아파트 단지 목록 조회
 */
export async function getComplexesByBrand(
  brand: string,
  page = 1,
  limit = 20
): Promise<ComplexListResult> {
  const offset = (page - 1) * limit

  const { data, count, error } = await supabase
    .from('complexes')
    .select('*', { count: 'exact' })
    .eq('brand', brand)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(error.message)
  }

  const items = (data || []).map(transformComplex)

  return {
    items,
    total: count || 0,
    page,
    limit,
  }
}

/**
 * DB 레코드를 Complex 타입으로 변환
 * PostGIS GEOGRAPHY 타입을 lat/lng 객체로 변환
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformComplex(record: any): Complex {
  const complex: Complex = {
    id: record.id,
    name: record.name,
    address: record.address,
    sido: record.sido,
    sigungu: record.sigungu,
    eupmyeondong: record.eupmyeondong,
    total_units: record.total_units,
    total_buildings: record.total_buildings,
    built_year: record.built_year,
    parking_ratio: record.parking_ratio
      ? parseFloat(record.parking_ratio)
      : undefined,
    brand: record.brand,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }

  // PostGIS GEOGRAPHY POINT → lat/lng 변환
  if (record.location) {
    // Supabase는 GEOGRAPHY를 GeoJSON 형식으로 반환
    // { type: 'Point', coordinates: [lng, lat] }
    if (typeof record.location === 'object' && record.location.coordinates) {
      complex.location = {
        lng: record.location.coordinates[0],
        lat: record.location.coordinates[1],
      }
    }
  }

  return complex
}
