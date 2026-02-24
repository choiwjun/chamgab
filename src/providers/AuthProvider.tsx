// @TASK P1-R1-T1 - Supabase Auth Provider
// @SPEC specs/domain/resources.yaml#users
// @SPEC .claude/constitutions/supabase/auth-integration.md

'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { createClient, clearSupabaseAuthCookies } from '@/lib/supabase/client'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { AuthContextType, UserProfile } from '@/types/auth'

const AUTH_REQUEST_TIMEOUT_MS = 5000
const TIMEOUT_SENTINEL = '__auth_timeout__'
const timeoutWarnAt = new Map<string, number>()
const TIMEOUT_WARN_INTERVAL_MS = 60000

function warnTimeout(label: string) {
  if (process.env.NODE_ENV !== 'development') return
  const now = Date.now()
  const prev = timeoutWarnAt.get(label) ?? 0
  if (now - prev < TIMEOUT_WARN_INTERVAL_MS) return
  timeoutWarnAt.set(label, now)
  console.warn(`[auth] ${label} timed out after ${AUTH_REQUEST_TIMEOUT_MS}ms`)
}

async function withTimeout<T>(
  operation: Promise<T>,
  fallback: T,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          warnTimeout(label)
          resolve(fallback)
        }, AUTH_REQUEST_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

// Auth Context 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

/**
 * AuthProvider - Supabase Auth 상태 관리
 *
 * 핵심 원칙: Supabase Auth만 사용 (NextAuth 혼용 금지)
 * @see .claude/constitutions/supabase/auth-integration.md
 */
const PROFILE_CACHE_KEY = 'chamgab_profile_cache'

function getCachedProfile(): UserProfile | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserProfile
  } catch {
    return null
  }
}

function setCachedProfile(p: UserProfile | null) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (p) {
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p))
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY)
    }
  } catch { /* quota exceeded etc */ }
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Create the Supabase browser client inside the component to avoid any
  // module-eval side effects and allow preflight cookie repairs.
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(() => getCachedProfile())
  const [isLoading, setIsLoading] = useState(true)
  const profileRef = useRef<UserProfile | null>(null)

  // setProfile wrapper that also persists to sessionStorage
  const updateProfile = useCallback((p: UserProfile | null) => {
    setProfile(p)
    setCachedProfile(p)
  }, [])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  // 프로필 조회
  const fetchProfile = useCallback(
    async (userId: string) => {
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
    },
    [supabase]
  )

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

  const enforceSuspension = useCallback(
    async (profile: UserProfile | null) => {
      if (!isSuspended(profile)) return false
      // If the account is suspended, drop the session client-side as a belt-and-suspenders.
      try {
        await supabase.auth.signOut()
      } catch {
        // ignore
      } finally {
        clearSupabaseAuthCookies()
        setUser(null)
        updateProfile(null)
      }
      return true
    },
    [supabase, updateProfile]
  )

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
        clearSupabaseAuthCookies()
        setUser(null)
        updateProfile(null)
      }
      return true
    },
    [supabase, updateProfile]
  )

  // 사용자 정보 새로고침
  const refreshUser = useCallback(async () => {
    setIsLoading(true)
    try {
      const sessionFallback = {
        data: { session: null },
        error: { message: TIMEOUT_SENTINEL },
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getSession>>

      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        sessionFallback,
        'getSession'
      )
      const timedOut =
        (
          sessionResult as {
            error?: { message?: string } | null
          }
        ).error?.message === TIMEOUT_SENTINEL
      if (timedOut) return

      const {
        data: { session },
      } = sessionResult
      const currentUser = session?.user ?? null

      setUser(currentUser)

      if (currentUser) {
        const fallbackProfile =
          profileRef.current?.id === currentUser.id ? profileRef.current : null
        const userProfile = await withTimeout(
          fetchProfile(currentUser.id),
          fallbackProfile,
          'fetchProfile(refreshUser)'
        )
        if (!(await enforceSuspension(userProfile))) {
          if (
            await enforceForceLogout(
              userProfile,
              currentUser,
              session?.access_token
            )
          )
            return
          updateProfile(userProfile)
        }
      } else {
        updateProfile(null)
      }
    } catch (error) {
      // AbortError는 컴포넌트 언마운트/리렌더 시 정상 발생 → 무시
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Error refreshing user:', error)
      setUser(null)
      updateProfile(null)
    } finally {
      setIsLoading(false)
    }
  }, [fetchProfile, supabase, updateProfile])

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
  const signInWithOAuth = useCallback(
    async (provider: 'google' | 'kakao') => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        throw error
      }
    },
    [supabase]
  )

  // 로그아웃
  const signOut = useCallback(async () => {
    try {
      // 5초 타임아웃으로 signOut (네트워크 문제 시 hang 방지)
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      // 에러/타임아웃 관계없이 항상 쿠키 강제 삭제 + 상태 초기화
      clearSupabaseAuthCookies()
      setUser(null)
      updateProfile(null)
    }
  }, [supabase, updateProfile])

  // 초기 세션 확인 및 Auth 상태 변화 구독
  useEffect(() => {
    let mounted = true

    // 초기 사용자 확인
    refreshUser()

    // Auth 상태 변화 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return
        try {
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session?.user) {
              setUser(session.user)
              const fallbackProfile =
                profileRef.current?.id === session.user.id ? profileRef.current : null
              const userProfile = await withTimeout(
                fetchProfile(session.user.id),
                fallbackProfile,
                'fetchProfile(onAuthStateChange)'
              )
              if (!mounted) return
              if (!(await enforceSuspension(userProfile))) {
                if (
                  await enforceForceLogout(
                    userProfile,
                    session.user,
                    session.access_token
                  )
                )
                  return
                if (mounted) updateProfile(userProfile)
              }
            }
          } else if (event === 'SIGNED_OUT') {
            setUser(null)
            updateProfile(null)
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
          throw error
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [refreshUser, fetchProfile, supabase])

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
