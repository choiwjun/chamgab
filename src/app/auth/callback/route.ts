// @TASK P1-R1-T1 - OAuth 콜백 라우트
// @SPEC specs/screens/auth-login.yaml#connections

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /auth/callback
 * OAuth 인증 완료 후 콜백 처리
 *
 * Supabase OAuth 프로바이더(Google, Kakao, Naver)에서 인증 완료 후
 * 이 경로로 리다이렉트됨
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  // OAuth 인증 코드
  const code = searchParams.get('code')

  // 원래 리다이렉트 경로 (Open Redirect 방지: 내부 경로만 허용)
  const raw = searchParams.get('next') ?? searchParams.get('redirect') ?? '/'
  const next =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')
      ? raw
      : '/'

  // OAuth 에러 처리
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (code) {
    try {
      const supabase = await createClient()

      // 코드로 세션 교환
      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code)

      if (!exchangeError) {
        // 인증 성공 - 원래 경로로 리다이렉트
        return NextResponse.redirect(`${origin}${next}`)
      }

      console.error('Session exchange error:', exchangeError)
    } catch (err) {
      console.error('Callback error:', err)
    }
  }

  // 인증 실패 - 로그인 페이지로 리다이렉트 (에러 메시지 포함)
  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent('인증에 실패했습니다. 다시 시도해주세요.')}`
  )
}
