// @TASK P1-R1 - 네이버 OAuth 시작 라우트
// Supabase가 네이버를 지원하지 않아 직접 구현

import { NextResponse } from 'next/server'

/**
 * GET /api/auth/naver
 * 네이버 로그인 페이지로 리다이렉트
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const redirect = searchParams.get('redirect') || '/'

  const clientId = process.env.NAVER_CLIENT_ID

  if (!clientId) {
    console.error('NAVER_CLIENT_ID not configured')
    return NextResponse.redirect(
      new URL(
        '/auth/login?error=네이버 로그인이 설정되지 않았습니다.',
        request.url
      )
    )
  }

  // state에 redirect URL 포함 (CSRF 방지 + redirect 정보 전달)
  const state = Buffer.from(JSON.stringify({ redirect })).toString('base64')

  // 네이버 OAuth 인증 URL
  const naverAuthUrl = new URL('https://nid.naver.com/oauth2.0/authorize')
  naverAuthUrl.searchParams.set('response_type', 'code')
  naverAuthUrl.searchParams.set('client_id', clientId)
  naverAuthUrl.searchParams.set(
    'redirect_uri',
    `${new URL(request.url).origin}/api/auth/naver/callback`
  )
  naverAuthUrl.searchParams.set('state', state)

  return NextResponse.redirect(naverAuthUrl.toString())
}
