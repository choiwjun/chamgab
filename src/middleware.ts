// @TASK P1-R1-T3 - Auth Middleware
// @SPEC specs/domain/resources.yaml#users
// @SPEC .claude/constitutions/supabase/auth-integration.md

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * 보호된 라우트 목록
 * 인증이 필요한 경로들
 */
const PROTECTED_ROUTES = [
  '/favorites',
  '/notifications',
  '/mypage',
  '/reports',
  '/subscriptions',
  '/admin',
]

/**
 * Auth 관련 라우트 (로그인된 상태에서 접근 시 리다이렉트)
 */
const AUTH_ROUTES = ['/auth/login', '/auth/signup']

/**
 * 미들웨어 - Supabase Auth 세션 관리
 *
 * 역할:
 * 1. 세션 쿠키 갱신 (refresh token)
 * 2. 보호된 라우트 접근 제어
 * 3. 로그인 상태에서 Auth 페이지 접근 시 리다이렉트
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Supabase 서버 클라이언트 생성 (쿠키 갱신용)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies
            .getAll()
            .map((c) => ({ name: c.name, value: c.value }))
        },
        setAll(
          cookiesToSet: {
            name: string
            value: string
            options: CookieOptions
          }[]
        ) {
          // Important: apply all cookie mutations to a single response instance.
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set({ name, value, ...options })
            response.cookies.set({ name, value, ...options })
          }
        },
      },
    }
  )

  // 세션 갱신 (중요: getUser()로 검증된 사용자 정보 가져오기)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = request.nextUrl.pathname

  // 보호된 라우트 접근 제어
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )

  if (isProtectedRoute && !user) {
    // 로그인 페이지로 리다이렉트 (원래 URL 저장)
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Suspended users: block protected routes (server-side gate)
  if (isProtectedRoute && user) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_suspended,suspended_until,force_logout_at')
        .eq('id', user.id)
        .maybeSingle()

      const suspended = !!profile?.is_suspended
      const until = profile?.suspended_until
        ? new Date(profile.suspended_until)
        : null
      const activeSuspension =
        suspended &&
        (!until ||
          (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()))

      if (activeSuspension) {
        const redirectUrl = new URL('/auth/login', request.url)
        redirectUrl.searchParams.set('error', 'suspended')
        return NextResponse.redirect(redirectUrl)
      }

      const marker = profile?.force_logout_at
        ? new Date(profile.force_logout_at)
        : null
      const markerMs =
        marker && !Number.isNaN(marker.getTime()) ? marker.getTime() : null

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

      const iatMs = jwtIatMs(session?.access_token)
      const forcedLogout =
        markerMs !== null && typeof iatMs === 'number' && iatMs < markerMs

      if (forcedLogout) {
        const redirectUrl = new URL('/auth/login', request.url)
        redirectUrl.searchParams.set('error', 'forced_logout')
        return NextResponse.redirect(redirectUrl)
      }
    } catch {
      // If profile lookup fails, do not block.
    }
  }

  // 로그인된 상태에서 Auth 페이지 접근 시 홈으로 리다이렉트
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

/**
 * 미들웨어 적용 경로 설정
 */
export const config = {
  matcher: [
    /*
     * 다음 경로 제외:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico, sitemap.xml, robots.txt (메타데이터 파일)
     * - api (API 라우트는 각자 인증 처리)
     * - 정적 파일 확장자 (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
