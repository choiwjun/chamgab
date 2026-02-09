// @TASK Land Analysis Feature - Type definitions
// Land parcel and transaction types

export interface LandParcel {
  id: string
  pnu: string // 필지고유번호 19자리
  sido: string
  sigungu: string
  eupmyeondong: string | null
  jibun: string | null
  land_category: string // 지목: 대, 전, 답, 임, 잡 등
  zoning: string | null // 용도지역
  area_m2: number | null
  location: {
    type: 'Point'
    coordinates: [number, number] // [lng, lat]
  } | null
  latest_official_price_per_m2: number | null
  latest_official_price_year: number | null
  latest_transaction_price: number | null // 만원
  latest_transaction_date: string | null
  latest_price_per_m2: number | null // 원/m²
  created_at: string
  updated_at: string
}

export interface LandTransaction {
  id: string
  parcel_id: string | null
  sido: string
  sigungu: string
  eupmyeondong: string | null
  jibun: string | null
  land_category: string | null
  area_m2: number
  price: number // 만원
  price_per_m2: number | null // 원/m²
  transaction_date: string
  transaction_type: string | null
  is_partial_sale: boolean
  is_cancelled: boolean
  created_at: string
}

export interface LandRegionStats {
  region: string
  sigungu: string
  transaction_count: number
  avg_price_per_m2: number
  total_volume: number // 총 거래액
}

export interface LandSearchParams {
  query?: string
  sido?: string
  sigungu?: string
  land_category?: string
  min_area?: number
  max_area?: number
  min_price?: number
  max_price?: number
  sort?: 'date' | 'price' | 'area'
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

// 지목 코드 매핑
export const LAND_CATEGORY_LABELS: Record<string, string> = {
  대: '대지',
  전: '전',
  답: '답',
  임: '임야',
  잡: '잡종지',
  과: '과수원',
  목: '목장용지',
  공원: '공원',
  주차장: '주차장',
  학교: '학교용지',
  도로: '도로',
  철도: '철도용지',
  하천: '하천',
  유지: '유지',
  묘지: '묘지',
  공장: '공장용지',
  창고: '창고용지',
  체육: '체육용지',
  양어: '양어장',
  염전: '염전',
  광천: '광천지',
  사적: '사적지',
}
