// @TASK P1-R1 - Naver OAuth callback route
// Naver authorization completion -> Supabase session issuance

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface NaverTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  error?: string
  error_description?: string
}

interface NaverUserResponse {
  resultcode: string
  message: string
  response: {
    id: string
    email?: string
    name?: string
    nickname?: string
    profile_image?: string
  }
}

type NaverStateCookie = {
  nonce: string
  redirect: string
  issued_at: number
}

const NAVER_STATE_COOKIE = 'naver_oauth_state'
const NAVER_STATE_MAX_AGE_MS = 10 * 60 * 1000

function sanitizeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  const value = raw.trim()
  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//')) return '/'
  return value
}

function withClearedStateCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: NAVER_STATE_COOKIE,
    value: '',
    maxAge: 0,
    path: '/api/auth/naver/callback',
  })
  return response
}

function redirectWithError(origin: string, message: string): NextResponse {
  return withClearedStateCookie(
    NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(message)}`
    )
  )
}

function validateState(
  request: NextRequest,
  state: string | null
): { redirect: string } | null {
  if (!state) return null
  const rawCookie = request.cookies.get(NAVER_STATE_COOKIE)?.value
  if (!rawCookie) return null

  try {
    const decoded = Buffer.from(rawCookie, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as NaverStateCookie
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.nonce !== 'string' || parsed.nonce.length < 16) return null
    if (parsed.nonce !== state) return null
    if (
      typeof parsed.issued_at !== 'number' ||
      !Number.isFinite(parsed.issued_at)
    ) {
      return null
    }
    if (Date.now() - parsed.issued_at > NAVER_STATE_MAX_AGE_MS) {
      return null
    }
    return { redirect: sanitizeRedirectPath(parsed.redirect) }
  } catch {
    return null
  }
}

/**
 * GET /api/auth/naver/callback
 * Handles Naver OAuth callback.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    console.error('Naver OAuth error:', error, errorDescription)
    return redirectWithError(origin, errorDescription || error)
  }

  if (!code) {
    return redirectWithError(origin, '인증 코드가 없습니다.')
  }

  const stateResult = validateState(request, state)
  if (!stateResult) {
    return redirectWithError(origin, '로그인 요청이 유효하지 않습니다.')
  }
  const redirect = stateResult.redirect

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!clientId || !clientSecret) {
    console.error('Naver OAuth credentials not configured')
    return redirectWithError(origin, '네이버 로그인 설정 오류입니다.')
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase service role key not configured')
    return redirectWithError(origin, '서버 설정 오류입니다.')
  }

  try {
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token')
    tokenUrl.searchParams.set('grant_type', 'authorization_code')
    tokenUrl.searchParams.set('client_id', clientId)
    tokenUrl.searchParams.set('client_secret', clientSecret)
    tokenUrl.searchParams.set('code', code)
    tokenUrl.searchParams.set('state', state || '')

    const tokenResponse = await fetch(tokenUrl.toString())
    const tokenData: NaverTokenResponse = await tokenResponse.json()

    if (tokenData.error) {
      console.error(
        'Naver token error:',
        tokenData.error,
        tokenData.error_description
      )
      return redirectWithError(
        origin,
        tokenData.error_description || '토큰 발급에 실패했습니다.'
      )
    }

    const userResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })
    const userData: NaverUserResponse = await userResponse.json()

    if (userData.resultcode !== '00') {
      console.error('Naver user info error:', userData.message)
      return redirectWithError(origin, '사용자 정보 조회에 실패했습니다.')
    }

    const naverUser = userData.response
    const email = naverUser.email

    if (!email) {
      return redirectWithError(
        origin,
        '이메일 정보가 필요합니다. 네이버 계정 설정에서 이메일 제공에 동의해주세요.'
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    let userId: string

    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfile?.id) {
      userId = existingProfile.id
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
      const existingMeta = authUser?.user?.user_metadata || {}

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMeta,
          naver_id: naverUser.id,
          name: naverUser.name || naverUser.nickname || existingMeta?.name,
          avatar_url: naverUser.profile_image || existingMeta?.avatar_url,
          provider: 'naver',
        },
      })
    } else {
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            naver_id: naverUser.id,
            name: naverUser.name || naverUser.nickname,
            avatar_url: naverUser.profile_image,
            provider: 'naver',
          },
        })

      if (createError || !newUser.user) {
        const msg = (createError?.message || '').toLowerCase()
        if (msg.includes('already') || msg.includes('exists')) {
          const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers()
          const found = usersPage?.users?.find((u) => u.email === email)
          if (found?.id) {
            userId = found.id
          } else {
            console.error('Failed to resolve existing user by email')
            return redirectWithError(origin, '사용자 조회에 실패했습니다.')
          }
        } else {
          console.error('Failed to create user:', createError)
          return redirectWithError(origin, '사용자 생성에 실패했습니다.')
        }
      } else {
        userId = newUser.user.id
      }
    }

    try {
      const { data: prof } = await supabaseAdmin
        .from('user_profiles')
        .select('is_suspended,suspended_until')
        .eq('id', userId)
        .maybeSingle()
      const suspended = !!prof?.is_suspended
      const until = prof?.suspended_until ? new Date(prof.suspended_until) : null
      const activeSuspension =
        suspended &&
        (!until || (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()))
      if (activeSuspension) {
        return redirectWithError(
          origin,
          '정지된 계정입니다. 관리자에게 문의해주세요.'
        )
      }
    } catch {
      // ignore
    }

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${origin}${redirect}`,
        },
      })

    if (linkError || !linkData.properties?.hashed_token) {
      console.error('Failed to generate link:', linkError)
      return redirectWithError(origin, '세션 생성에 실패했습니다.')
    }

    const supabase = await createServerClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    if (verifyError) {
      console.error('Failed to verify OTP:', verifyError)
      return redirectWithError(origin, '로그인에 실패했습니다.')
    }

    return withClearedStateCookie(NextResponse.redirect(`${origin}${redirect}`))
  } catch (err) {
    console.error('Naver callback error:', err)
    return redirectWithError(
      origin,
      '네이버 로그인 처리 중 오류가 발생했습니다.'
    )
  }
}

