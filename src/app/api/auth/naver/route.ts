// @TASK P1-R1 - Naver OAuth start route

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const NAVER_STATE_COOKIE = 'naver_oauth_state'
const NAVER_STATE_TTL_SECONDS = 10 * 60

function sanitizeRedirectPath(raw: string | null): string {
  if (!raw) return '/'
  const value = raw.trim()
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

/**
 * GET /api/auth/naver
 * Redirects to Naver OAuth authorize endpoint.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const redirect = sanitizeRedirectPath(searchParams.get('redirect'))
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

  // CSRF binding: state carries a random nonce, cookie stores nonce+redirect.
  const nonce = crypto.randomBytes(16).toString('hex')
  const stateCookiePayload = Buffer.from(
    JSON.stringify({
      nonce,
      redirect,
      issued_at: Date.now(),
    }),
    'utf8'
  ).toString('base64url')

  const naverAuthUrl = new URL('https://nid.naver.com/oauth2.0/authorize')
  naverAuthUrl.searchParams.set('response_type', 'code')
  naverAuthUrl.searchParams.set('client_id', clientId)
  naverAuthUrl.searchParams.set(
    'redirect_uri',
    `${new URL(request.url).origin}/api/auth/naver/callback`
  )
  naverAuthUrl.searchParams.set('state', nonce)

  const response = NextResponse.redirect(naverAuthUrl.toString())
  response.cookies.set({
    name: NAVER_STATE_COOKIE,
    value: stateCookiePayload,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: NAVER_STATE_TTL_SECONDS,
    path: '/api/auth/naver/callback',
  })
  return response
}

