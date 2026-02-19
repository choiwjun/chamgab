// @TASK P2-R0-T1 - Complexes ?쒕퉬???덉씠??// @SPEC specs/domain/resources.yaml#complexes

import { createClient } from '@supabase/supabase-js'
import type { Complex, ComplexSearchParams } from '@/types/complex'
import { buildSearchTerms, sanitizeFilterInput } from '@/lib/sanitize'

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
 * ?꾪뙆???⑥? 紐⑸줉 議고쉶
 */
export async function getComplexes(
  params: ComplexSearchParams
): Promise<ComplexListResult> {
  const { sido, sigungu, keyword, page = 1, limit = 20 } = params
  const offset = (page - 1) * limit

  let query = supabase.from('complexes').select('*', { count: 'exact' })

  // ?꾪꽣 ?곸슜
  if (sido) {
    query = query.eq('sido', sido)
  }
  if (sigungu) {
    // ?좏깮 ?꾪꽣???뺥솗 留ㅼ묶?쇰줈 泥섎━ (寃?됱뼱 議곌굔怨?異⑸룎 諛⑹?)
    const sanitizedSigungu = sanitizeFilterInput(sigungu)
    if (sanitizedSigungu) {
      query = query.eq('sigungu', sanitizedSigungu)
    }
  }
  if (keyword) {
    const terms = buildSearchTerms(keyword, 5)
    if (terms.length > 0) {
      const searchFilters = terms.flatMap((term) => [
        `name.ilike.%${term}%`,
        `sigungu.ilike.%${term}%`,
        `sido.ilike.%${term}%`,
        `address.ilike.%${term}%`,
      ])
      query = query.or(searchFilters.join(','))
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

  // location 蹂??(PostGIS GEOGRAPHY ??lat/lng)
  const items = (data || []).map(transformComplex)

  return {
    items,
    total: count || 0,
    page,
    limit,
  }
}

/**
 * ?꾪뙆???⑥? ?⑥씪 議고쉶
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
 * 釉뚮옖?쒕퀎 ?꾪뙆???⑥? 紐⑸줉 議고쉶
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
 * DB ?덉퐫?쒕? Complex ??낆쑝濡?蹂?? * PostGIS GEOGRAPHY ??낆쓣 lat/lng 媛앹껜濡?蹂?? */
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

  // PostGIS GEOGRAPHY POINT -> lat/lng
  if (record.location) {
    // Supabase??GEOGRAPHY瑜?GeoJSON ?뺤떇?쇰줈 諛섑솚
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
