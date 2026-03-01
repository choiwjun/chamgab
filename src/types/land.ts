import type { QualityMeta } from './quality'

export interface LandParcel {
  id: string
  pnu: string
  sido: string
  sigungu: string
  eupmyeondong: string | null
  jibun: string | null
  land_category: string
  zoning: string | null
  area_m2: number | null
  location: {
    type: 'Point'
    coordinates: [number, number] // [lng, lat]
  } | null
  latest_official_price_per_m2: number | null
  latest_official_price_year: number | null
  latest_transaction_price: number | null // 만원
  latest_transaction_date: string | null
  latest_price_per_m2: number | null // 원/㎡
  created_at: string
  updated_at: string
}

export interface LandTransaction {
  id: string
  parcel_id: string | null
  pnu?: string | null
  sido: string
  sigungu: string
  eupmyeondong: string | null
  jibun: string | null
  land_category: string | null
  area_m2: number
  price: number // 만원
  price_per_m2: number | null // 원/㎡
  transaction_date: string
  transaction_type: string | null
  is_partial_sale: boolean
  is_cancelled: boolean
  zoning?: string | null
  created_at: string
}

export interface LandOfficialPrice {
  id: string
  parcel_id: string
  price_year: number
  official_price_per_m2: number
  created_at: string
}

export interface LandCharacteristics {
  id: string
  parcel_id: string
  land_use: string | null
  elevation_type: string | null
  terrain_shape: string | null
  road_access: string | null
  road_distance: string | null
  zoning_detail: string | null
  building_coverage: number | null
  floor_area_ratio: number | null
  created_at: string
  updated_at: string
}

export interface LandMapPoint {
  id: string
  title: string
  lat: number
  lng: number
  kind: 'subject' | 'nearby'
  land_category?: string | null
  transaction_price?: number | null
  transaction_date?: string | null
}

export interface LandRegionStats {
  region: string
  sigungu: string
  transaction_count: number
  avg_price_per_m2: number
  total_volume: number
  sample_pnu?: string | null
}

export interface LandSearchParams {
  q?: string
  sido?: string
  sigungu?: string
  land_category?: string
  zoning?: string
  min_area?: number
  max_area?: number
  min_price?: number
  max_price?: number
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface LandAnalysisResponse extends Partial<QualityMeta> {
  pnu: string
  analysis: {
    overall_score: number | null
    investment_grade: string
    sample_size: number
    nearby_sample_size: number
    [key: string]: unknown
  }
  snapshot: {
    sample_size: number
    parcel_transaction_count: number
    nearby_transaction_count: number
  }
}

export const LAND_CATEGORY_LABELS: Record<string, string> = {
  대: '대지',
  답: '답',
  전: '전',
  임야: '임야',
  잡종지: '잡종지',
  과수원: '과수원',
  목장용지: '목장용지',
  공원: '공원',
  주차장: '주차장',
  학교용지: '학교용지',
  도로: '도로',
  철도용지: '철도용지',
  하천: '하천',
  유지: '유지',
  묘지: '묘지',
  공장용지: '공장용지',
  창고용지: '창고용지',
  체육용지: '체육용지',
  양어장: '양어장',
  염전: '염전',
  광천지: '광천지',
  사적지: '사적지',
}
