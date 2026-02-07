// @TASK P1-S0-T3 - Auth 훅 (AuthProvider 통합)
// @SPEC specs/shared/components.yaml

'use client'

import { useAuth as useAuthContext } from '@/providers/AuthProvider'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

/**
 * 인증 상태 관리 훅 (AuthProvider 기반)
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, isLoading, signIn, signOut } = useAuth()
 * ```
 */
export function useAuth() {
  const router = useRouter()
  const authContext = useAuthContext()
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)

  /**
   * 인증이 필요한 페이지에서 사용
   * 비로그인 시 로그인 페이지로 리다이렉트 (명령형)
   */
  const requireAuth = useCallback(() => {
    if (!authContext.isLoading && !authContext.isAuthenticated) {
      router.push('/auth/login' as never)
    }
  }, [authContext.isLoading, authContext.isAuthenticated, router])

  // 읽지 않은 알림 개수 가져오기
  useEffect(() => {
    if (authContext.isAuthenticated) {
      const fetchUnreadCount = async () => {
        try {
          const res = await fetch('/api/notifications?limit=1&unread_only=true')
          if (res.ok) {
            const data = await res.json()
            setUnreadNotificationCount(data.unread_count || 0)
          }
        } catch {
          setUnreadNotificationCount(0)
        }
      }
      fetchUnreadCount()
    } else {
      setUnreadNotificationCount(0)
    }
  }, [authContext.isAuthenticated])

  return {
    ...authContext,
    unreadNotificationCount,
    requireAuth,
    // 호환성을 위한 별칭
    login: authContext.signIn,
    logout: authContext.signOut,
    signup: authContext.signUp,
    loginWithOAuth: authContext.signInWithOAuth,
  }
}

// 타입 export (외부에서 사용 가능)
export type { AuthContextType } from '@/types/auth'
