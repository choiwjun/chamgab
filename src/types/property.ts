// @TASK P2-R1-T1 - Properties 타입 정의
export type PropertyType =
  | 'apt'
  | 'officetel'
  | 'villa'
  | 'store'
  | 'land'
  | 'building'

export interface Property {
  id: string
  property_type: PropertyType
  name: string
  address: string
  sido?: string
  sigungu?: string
  eupmyeondong?: string
  location?: { lat: number; lng: number }
  latitude?: number
  longitude?: number
  area_exclusive?: number
  price?: number
  floor?: number
  total_floors?: number
  built_year?: number
  floors?: number
  building_name?: string
  thumbnail?: string
  image_url?: string | null
  images?: string[]
  complex_id?: string
  created_at: string
}

export interface PropertyQueryParams {
  q?: string
  region?: string
  sido?: string
  sigungu?: string
  property_type?: PropertyType
  min_price?: number
  max_price?: number
  min_area?: number
  max_area?: number
  page?: number
  limit?: number
  sort?: string
}

export interface PropertyResponse {
  items: Property[]
  total: number
  page: number
  limit: number
}

export interface SearchSuggestion {
  id: string
  name: string
  type: 'property' | 'complex' | 'region'
  address?: string
  description?: string
}
