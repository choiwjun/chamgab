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
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // 요청에 쿠키 설정
          request.cookies.set({
            name,
            value,
            ...options,
          })
          // 응답에 쿠키 설정
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // 세션 갱신 (중요: getUser()로 검증된 사용자 정보 가져오기)
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
