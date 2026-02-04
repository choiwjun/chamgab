// @TASK P4-S6-T1 - Favorites 타입 정의
// @SPEC specs/screens/favorites.yaml

import type { Property } from './property'

export interface Favorite {
  id: string
  user_id: string
  property_id: string
  notify_enabled: boolean
  created_at: string
  updated_at?: string
  properties?: Property // Supabase JOIN 결과
}

export interface FavoriteQueryParams {
  page?: number
  limit?: number
  sort?: 'created_at' | 'price' // 최신순, 가격순
}

export interface FavoriteResponse {
  items: Favorite[]
  total: number
  page: number
  limit: number
  is_mock?: boolean
}
