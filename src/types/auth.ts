// @TASK P1-R1 - Auth 타입 정의
// @SPEC specs/domain/resources.yaml#users

import type { User } from '@supabase/supabase-js'

/**
 * 사용자 티어
 */
export type UserTier = 'free' | 'premium' | 'business'

/**
 * 확장된 사용자 프로필
 */
export interface UserProfile {
  id: string
  email: string
  name: string | null
  avatar_url?: string | null
  tier: UserTier
  daily_analysis_count: number
  daily_analysis_limit: number
  daily_credit_used?: number
  daily_credit_limit?: number
  daily_credit_reset_at?: string
  monthly_credit_used?: number
  monthly_credit_limit?: number
  monthly_credit_reset_at?: string
  bonus_credits?: number
  force_logout_at?: string | null
  is_suspended?: boolean
  suspended_until?: string | null
  suspended_reason?: string | null
  created_at: string
  updated_at: string
}

/**
 * Auth 컨텍스트 상태
 */
export interface AuthState {
  user: User | null
  profile: UserProfile | null
  isLoading: boolean
  isAuthenticated: boolean
}

/**
 * Auth 컨텍스트 액션
 */
export interface AuthActions {
  signUp: (email: string, password: string, name: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithOAuth: (provider: 'google' | 'kakao') => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

/**
 * Auth 컨텍스트 전체 타입
 */
export type AuthContextType = AuthState & AuthActions

/**
 * 회원가입 요청
 */
export interface SignupRequest {
  email: string
  password: string
  name: string
}

/**
 * 로그인 요청
 */
export interface LoginRequest {
  email: string
  password: string
}

/**
 * 이메일 확인 요청
 */
export interface CheckEmailRequest {
  email: string
}

/**
 * 이메일 확인 응답
 */
export interface CheckEmailResponse {
  available: boolean
  message: string
}

/**
 * Auth API 에러 응답
 */
export interface AuthErrorResponse {
  error: string
  code?: string
}

/**
 * Auth API 성공 응답
 */
export interface AuthSuccessResponse {
  message: string
  user?: {
    id: string
    email: string
    name: string
  }
}
