// @TASK P1-R1-T3 - Auth Middleware
// @SPEC specs/domain/resources.yaml#users
// @SPEC .claude/constitutions/supabase/auth-integration.md

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_REQUEST_TIMEOUT_MS = 8000
const DOMAIN_GATE_TIMEOUT_MS = 5000
const REMOVED_PREFIX_ROUTES = ['/compare', '/business-analysis/compare']
type DomainKey = 'apartment' | 'commercial' | 'school' | 'land'
type DomainLocks = Record<DomainKey, boolean>

const DEFAULT_FAIL_CLOSED_LOCKS: DomainLocks = {
  apartment: true,
  commercial: true,
  school: true,
  land: true,
}
const DEFAULT_FAIL_OPEN_LOCKS: DomainLocks = {
  apartment: false,
  commercial: false,
  school: false,
  land: false,
}
const DOMAIN_GATE_FAIL_CLOSED =
  (process.env.DOMAIN_GATE_FAIL_CLOSED || 'false').trim().toLowerCase() ===
  'true'
const DOMAIN_GATE_FALLBACK_LOCKS = DOMAIN_GATE_FAIL_CLOSED
  ? DEFAULT_FAIL_CLOSED_LOCKS
  : DEFAULT_FAIL_OPEN_LOCKS
const LAND_PUBLIC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LAND === 'true'

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
          console.warn(
            `[middleware] ${label} timed out after ${AUTH_REQUEST_TIMEOUT_MS}ms`
          )
          resolve(fallback)
        }, AUTH_REQUEST_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/**
 * 공개 라우트 목록
 * 인증이 필요하지 않은 경로
 */
const PUBLIC_EXACT_ROUTES = ['/']
const PUBLIC_PREFIX_ROUTES = ['/auth', '/terms', '/school-analysis/share']

/**
 * Auth 관련 라우트 (로그인된 상태에서 접근 시 리다이렉트)
 */
const AUTH_ROUTES = ['/auth/login', '/auth/signup']

function isRouteMatch(pathname: string, route: string) {
  if (route === '/') return pathname === '/'
  return pathname === route || pathname.startsWith(`${route}/`)
}

function isExactRouteMatch(pathname: string, route: string) {
  return pathname === route
}

function isPrefixRouteMatch(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function getDomainByPathname(pathname: string): DomainKey | null {
  if (
    pathname === '/search' ||
    pathname.startsWith('/search/') ||
    pathname.startsWith('/property/') ||
    pathname.startsWith('/complex/')
  ) {
    return 'apartment'
  }
  if (
    pathname === '/business-analysis' ||
    pathname.startsWith('/business-analysis/')
  ) {
    return 'commercial'
  }
  if (
    pathname === '/school-analysis' ||
    pathname.startsWith('/school-analysis/')
  ) {
    if (
      pathname === '/school-analysis/share' ||
      pathname.startsWith('/school-analysis/share/')
    ) {
      return null
    }
    return 'school'
  }
  if (pathname === '/land' || pathname.startsWith('/land/')) {
    return 'land'
  }
  return null
}

async function fetchDomainLocks(request: NextRequest): Promise<DomainLocks> {
  const url = new URL('/api/domain-gates', request.url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOMAIN_GATE_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return DOMAIN_GATE_FALLBACK_LOCKS
    const payload = (await res.json()) as {
      locked?: Partial<DomainLocks>
    }
    return {
      apartment:
        payload.locked?.apartment ?? DOMAIN_GATE_FALLBACK_LOCKS.apartment,
      commercial:
        payload.locked?.commercial ?? DOMAIN_GATE_FALLBACK_LOCKS.commercial,
      school: payload.locked?.school ?? DOMAIN_GATE_FALLBACK_LOCKS.school,
      land: payload.locked?.land ?? DOMAIN_GATE_FALLBACK_LOCKS.land,
    }
  } catch {
    return DOMAIN_GATE_FALLBACK_LOCKS
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 미들웨어 - Supabase Auth 세션 관리
 *
 * 역할:
 * 1. 세션 쿠키 갱신 (refresh token)
 * 2. 보호된 라우트 접근 제어
 * 3. 로그인 상태에서 Auth 페이지 접근 시 리다이렉트
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    !LAND_PUBLIC_ENABLED &&
    (pathname === '/land' || pathname.startsWith('/land/'))
  ) {
    if (pathname !== '/land') {
      const redirectUrl = new URL('/land', request.url)
      redirectUrl.searchParams.set('status', 'preparing')
      return NextResponse.redirect(redirectUrl)
    }
  }

  // OAuth code가 루트에 떨어진 경우 /auth/callback으로 전달
  const code = request.nextUrl.searchParams.get('code')
  if (code && pathname === '/') {
    const callbackUrl = new URL('/auth/callback', request.url)
    callbackUrl.searchParams.set('code', code)
    return NextResponse.redirect(callbackUrl)
  }

  // 완전 제거된 경로는 로그인 리다이렉트 없이 즉시 404 처리
  const isRemovedRoute = REMOVED_PREFIX_ROUTES.some((route) =>
    isPrefixRouteMatch(pathname, route)
  )
  if (isRemovedRoute) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  const targetDomain = getDomainByPathname(pathname)
  if (targetDomain) {
    const locks = await fetchDomainLocks(request)
    if (
      !(targetDomain === 'land' && !LAND_PUBLIC_ENABLED) &&
      locks[targetDomain]
    ) {
      const redirectUrl = new URL('/', request.url)
      redirectUrl.searchParams.set('domain_locked', targetDomain)
      return NextResponse.redirect(redirectUrl)
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Supabase 서버 클라이언트 생성 (쿠키 갱신)
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

  // Session lookup with timeout to prevent route hangs.
  const {
    data: { session },
  } = await withTimeout(
    supabase.auth.getSession(),
    { data: { session: null }, error: null },
    'getSession'
  )
  const user = session?.user ?? null

  // 보호된 라우트 접근 제어
  const isAuthRoute = AUTH_ROUTES.some((route) => isRouteMatch(pathname, route))
  const isPublicRoute =
    PUBLIC_EXACT_ROUTES.some((route) => isExactRouteMatch(pathname, route)) ||
    PUBLIC_PREFIX_ROUTES.some((route) => isPrefixRouteMatch(pathname, route)) ||
    (!LAND_PUBLIC_ENABLED && pathname === '/land')
  const requiresAuth = !isAuthRoute && !isPublicRoute

  if (requiresAuth && !user) {
    // 로그인 페이지로 리다이렉트 (원래 URL 포함)
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set(
      'redirect',
      `${pathname}${request.nextUrl.search}`
    )
    return NextResponse.redirect(redirectUrl)
  }

  // Note: 정지/강제로그아웃 체크는 AuthProvider(클라이언트)에서 수행.
  // 미들웨어에서 매 요청마다 user_profiles DB 쿼리를 하면 로딩 속도가 크게 저하됨.

  // Redirect authenticated users away from auth pages
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
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
}
