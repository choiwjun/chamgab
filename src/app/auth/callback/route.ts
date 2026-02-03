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

  // 원래 리다이렉트 경로 (없으면 홈)
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()

    // 코드로 세션 교환
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // 인증 성공 - 원래 경로로 리다이렉트
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // 인증 실패 - 에러 페이지로 리다이렉트
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
