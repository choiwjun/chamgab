// @TASK P1-R1-T1 - Supabase Auth Provider
// @SPEC specs/domain/resources.yaml#users
// @SPEC .claude/constitutions/supabase/auth-integration.md

'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { AuthContextType, UserProfile } from '@/types/auth'

// Auth Context 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Supabase 클라이언트 (싱글톤)
const supabase = createClient()

interface AuthProviderProps {
  children: ReactNode
}

/**
 * AuthProvider - Supabase Auth 상태 관리
 *
 * 핵심 원칙: Supabase Auth만 사용 (NextAuth 혼용 금지)
 * @see .claude/constitutions/supabase/auth-integration.md
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 프로필 조회
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return null
    }

    return data as UserProfile
  }, [])

  const isSuspended = (profile: UserProfile | null) => {
    if (!profile?.is_suspended) return false
    if (!profile.suspended_until) return true
    const until = new Date(profile.suspended_until)
    return !Number.isNaN(until.getTime()) ? until.getTime() > Date.now() : true
  }

  const jwtIatMs = (accessToken?: string | null) => {
    if (!accessToken) return null
    try {
      const parts = accessToken.split('.')
      if (parts.length < 2) return null
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const pad =
        payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4))
      const json = atob(payload + pad)
      const obj = JSON.parse(json) as { iat?: number }
      if (typeof obj.iat !== 'number') return null
      return obj.iat * 1000
    } catch {
      return null
    }
  }

  const shouldForceLogout = (
    profile: UserProfile | null,
    user: User | null,
    accessToken?: string | null
  ) => {
    const marker = profile?.force_logout_at
    if (!marker) return false
    const markerMs = new Date(marker).getTime()
    if (Number.isNaN(markerMs)) return false

    // Primary: token issued-at time.
    const iat = jwtIatMs(accessToken)
    if (typeof iat === 'number') return iat < markerMs

    // Fallback: last_sign_in_at if present on the user object.
    const lastSignIn = (user as Record<string, unknown> | null)
      ?.last_sign_in_at as string | undefined
    if (!lastSignIn) return false
    const lastMs = new Date(lastSignIn).getTime()
    if (Number.isNaN(lastMs)) return false
    return lastMs < markerMs
  }

  const enforceSuspension = useCallback(async (profile: UserProfile | null) => {
    if (!isSuspended(profile)) return false
    // If the account is suspended, drop the session client-side as a belt-and-suspenders.
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    } finally {
      setUser(null)
      setProfile(null)
    }
    return true
  }, [])

  const enforceForceLogout = useCallback(
    async (
      profile: UserProfile | null,
      user: User | null,
      accessToken?: string | null
    ) => {
      if (!shouldForceLogout(profile, user, accessToken)) return false
      try {
        await supabase.auth.signOut()
      } catch {
        // ignore
      } finally {
        setUser(null)
        setProfile(null)
      }
      return true
    },
    []
  )

  // 사용자 정보 새로고침
  const refreshUser = useCallback(async () => {
    setIsLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      setUser(currentUser)

      if (currentUser) {
        const userProfile = await fetchProfile(currentUser.id)
        if (!(await enforceSuspension(userProfile))) {
          if (
            await enforceForceLogout(
              userProfile,
              currentUser,
              session?.access_token
            )
          )
            return
          setProfile(userProfile)
        }
      } else {
        setProfile(null)
      }
    } catch (error) {
      console.error('Error refreshing user:', error)
      setUser(null)
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
  }, [fetchProfile])

  // 회원가입
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
            },
          },
        })

        if (error) {
          throw error
        }

        if (data.user) {
          // 프로필은 Supabase trigger로 자동 생성됨
          await refreshUser()
        }
      } finally {
        setIsLoading(false)
      }
    },
    [refreshUser]
  )

  // 이메일 로그인
  const signIn = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true)
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          throw error
        }

        await refreshUser()
      } finally {
        setIsLoading(false)
      }
    },
    [refreshUser]
  )

  // OAuth 로그인 (Google, Kakao만 지원)
  // Note: Supabase는 Naver OAuth를 공식 지원하지 않음
  const signInWithOAuth = useCallback(async (provider: 'google' | 'kakao') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      throw error
    }
  }, [])

  // 로그아웃
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      // 에러 여부와 관계없이 항상 클라이언트 상태 초기화
      setUser(null)
      setProfile(null)
    }
  }, [])

  // 초기 세션 확인 및 Auth 상태 변화 구독
  useEffect(() => {
    // 초기 사용자 확인
    refreshUser()

    // Auth 상태 변화 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setUser(session.user)
            const userProfile = await fetchProfile(session.user.id)
            if (!(await enforceSuspension(userProfile))) {
              if (
                await enforceForceLogout(
                  userProfile,
                  session.user,
                  session.access_token
                )
              )
                return
              setProfile(userProfile)
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [refreshUser, fetchProfile])

  const value: AuthContextType = {
    user,
    profile,
    isLoading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * useAuth - Auth 컨텍스트 사용 훅
 *
 * @throws {Error} AuthProvider 외부에서 사용 시 에러
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

export { AuthContext }
