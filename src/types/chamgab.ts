// @TASK P3-R1 - Chamgab Analyses 타입 정의

export interface ChamgabAnalysis {
  id: string
  property_id: string
  user_id?: string
  chamgab_price: number
  min_price: number
  max_price: number
  confidence: number
  analyzed_at: string
  expires_at: string
  created_at: string
}

export interface PriceFactor {
  id: string
  analysis_id: string
  rank: number
  factor_name: string
  factor_name_ko: string
  contribution: number
  direction: 'positive' | 'negative'
  created_at: string
}

export interface Transaction {
  id: string
  property_id?: string
  complex_id?: string
  transaction_date: string
  price: number
  area_exclusive?: number
  floor?: number
  dong?: string
  buyer_type?: string
  created_at: string
  // 유사도 (API에서 계산)
  similarity?: number
}

export interface Favorite {
  id: string
  user_id: string
  property_id: string
  created_at: string
}

// API Response Types
export interface ChamgabAnalysisResponse {
  analysis: ChamgabAnalysis
  factors?: PriceFactor[]
}

export interface ChamgabRequestBody {
  property_id: string
}

export interface SimilarTransactionsResponse {
  transactions: Transaction[]
  total: number
}

export interface FavoritesResponse {
  items: Favorite[]
  total: number
}
